import { prisma } from '../prisma';
import { buildMemberWhere, MemberFilter } from '../memberFilter';
import { sendEmail } from '../emails/send';
import { sendSms } from '../sms/send';
import { campaignEmail } from '../emails/campaignEmail';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;

// Real list sizes run 100-5,000. Sending all of them in one HTTP request
// would risk hitting a serverless function's timeout on the larger lists.
// Instead, each call processes one bounded batch and returns — a scheduled
// job (see src/scripts/processCampaignSends.ts) calls this repeatedly every
// minute or so until the send completes. This also gives pause/cancel a
// natural checkpoint between every batch, not just within one long loop.
const BATCH_SIZE = 100;

/**
 * Starts a new send for a (reusable) campaign: snapshots its current filter
 * into a fresh CampaignSend row, resolves and locks in the recipient list,
 * processes the first batch immediately (for responsiveness), and leaves
 * the rest to the scheduled job. This is what "Send Blast Now" does — a
 * blast can have many of these over its lifetime (its History tab).
 */
export async function startCampaignSend(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  const contactMethods: ('EMAIL_AND_SMS' | 'EMAIL' | 'SMS')[] = [];
  if (campaign.sendEmail) contactMethods.push('EMAIL_AND_SMS', 'EMAIL');
  if (campaign.sendSms) contactMethods.push('EMAIL_AND_SMS', 'SMS');

  const filter: MemberFilter = {
    ...(campaign.filter as MemberFilter),
    marketingOptInOnly: !campaign.ignorePreference,
    contactMethods: campaign.ignorePreference ? undefined : [...new Set(contactMethods)],
    excludeBounced: campaign.sendEmail && !campaign.ignorePreference,
  };
  const where = buildMemberWhere(filter);
  const recipients = await prisma.member.findMany({ where, select: { id: true } });
  const recipientIds = recipients.map((r) => r.id);

  const send = await prisma.campaignSend.create({
    data: {
      campaignId,
      filterSnapshot: campaign.filter as any,
      recipientIds,
      totalRecipients: recipientIds.length,
      status: 'SENDING',
    },
  });

  return processCampaignSendBatch(send.id);
}

/**
 * Processes up to BATCH_SIZE recipients for one CampaignSend, starting from
 * sentCount, then returns. Safe to call repeatedly (by the scheduled job, or
 * manually via resume) — always picks up where it left off. Checks status
 * before and after the batch so pause/cancel take effect between batches.
 */
export async function processCampaignSendBatch(sendId: string) {
  const send = await prisma.campaignSend.findUniqueOrThrow({ where: { id: sendId }, include: { campaign: true } });
  if (send.status !== 'SENDING') {
    return { done: send.status !== 'PENDING', sentCount: send.sentCount, status: send.status };
  }

  const campaign = send.campaign;
  const recipientIds = (send.recipientIds as string[]) ?? [];
  const batchEnd = Math.min(send.sentCount + BATCH_SIZE, recipientIds.length);

  for (let i = send.sentCount; i < batchEnd; i++) {
    const recipient = await prisma.member.findUnique({ where: { id: recipientIds[i] } });
    if (recipient) {
      if (
        campaign.sendEmail &&
        (recipient.contactMethod === 'EMAIL_AND_SMS' || recipient.contactMethod === 'EMAIL' || campaign.ignorePreference)
      ) {
        try {
          const unsubscribeToken = jwt.sign({ memberId: recipient.id, purpose: 'unsubscribe' }, JWT_SECRET);
          const { subject, html } = campaignEmail({
            subject: campaign.subject ?? '',
            bodyHtml: campaign.emailBody ?? '',
            unsubscribeUrl: `${process.env.APP_URL}/unsubscribe?token=${unsubscribeToken}`,
          });
          await sendEmail({ to: recipient.email, subject, html });
        } catch {
          await prisma.member.update({
            where: { id: recipient.id },
            data: { emailBounced: true, bounceReason: 'Rejected on send' },
          });
        }
      }
      if (
        campaign.sendSms &&
        (recipient.contactMethod === 'EMAIL_AND_SMS' || recipient.contactMethod === 'SMS' || campaign.ignorePreference)
      ) {
        await sendSms({ to: recipient.mobile, body: campaign.smsBody ?? '' });
      }
    }
  }

  const sentCount = batchEnd;
  const isComplete = sentCount >= recipientIds.length;

  await prisma.campaignSend.update({
    where: { id: sendId },
    data: isComplete
      ? { sentCount, status: 'SENT', completedAt: new Date() }
      : { sentCount },
  });

  return { done: isComplete, sentCount, status: isComplete ? ('SENT' as const) : ('SENDING' as const) };
}
