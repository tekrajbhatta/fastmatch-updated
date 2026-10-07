import { prisma } from '../prisma';
import { buildMemberWhere, MemberFilter } from '../memberFilter';
import { sendEmail } from '../emails/send';
import { sendSmsBulk, withOptOut } from '../sms/send';
import { resolveCampaignEmailHtml } from '../emails/campaignEmail';
import { recipientFilter } from './audience';
import { isPermanentAddressRejection } from './sendFailure';
import { oneLine } from '../escapeHtml';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;

// Real list sizes run 100-5,000. Sending all of them in one HTTP request
// would risk hitting a serverless function's timeout on the larger lists.
// Instead, each call processes one bounded batch and returns — a scheduled
// job (see src/scripts/processCampaignSends.ts) calls this repeatedly every
// minute or so until the send completes. This also gives pause/cancel a
// natural checkpoint between every batch, not just within one long loop.
const BATCH_SIZE = 100;

export const SEND_IN_FLIGHT_ERROR =
  'This blast is already being sent. Wait for it to finish, or pause or cancel it on the blast’s Send tab, before sending it again.';

/**
 * Starts a new send for a (reusable) campaign: snapshots its current filter
 * into a fresh CampaignSend row and locks in the recipient list. Nothing is
 * sent here: the caller runs the first batch once it has answered (so "Send
 * Blast Now" never waits on a hundred emails), and the scheduled job carries
 * on with the rest. This is what "Send Blast Now" does — a blast can have
 * many of these over its lifetime (its History tab).
 *
 * Refused while the blast already has a send going (or paused): a second
 * press, or a second tab, used to send the whole list again. Checked with the
 * blast locked, so two presses at once can't both start one.
 */
export async function startCampaignSend(
  campaignId: string,
): Promise<{ ok: true; sendId: string; totalRecipients: number } | { ok: false; error: string }> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  const where = buildMemberWhere(recipientFilter(campaign.filter as MemberFilter, campaign));
  const recipients = await prisma.member.findMany({ where, select: { id: true } });
  const recipientIds = recipients.map((r) => r.id);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`Campaign\` WHERE id = ${campaignId} FOR UPDATE`;
    const inFlight = await tx.campaignSend.findFirst({ where: { campaignId, status: { in: ['SENDING', 'PAUSED'] } } });
    if (inFlight) return { ok: false as const, error: SEND_IN_FLIGHT_ERROR };
    const send = await tx.campaignSend.create({
      data: {
        campaignId,
        filterSnapshot: campaign.filter as any,
        recipientIds,
        totalRecipients: recipientIds.length,
        status: 'SENDING',
      },
    });
    return { ok: true as const, sendId: send.id, totalRecipients: recipientIds.length };
  });
}

/**
 * Processes up to BATCH_SIZE recipients for one CampaignSend, starting from
 * sentCount, then returns. Safe to call repeatedly (by the scheduled job, or
 * manually via resume) — always picks up where it left off.
 *
 * Each recipient is claimed (sentCount moved past them, while the send is
 * still SENDING) before anything goes to them. So two runs at once — the
 * scheduled job while "Send Blast Now" is still on its first batch, a resume
 * against the job — can never both send to the same person: whichever claims
 * a recipient sends to them, and the other stops. It also means pause and
 * cancel take effect straight away, and a crash mid-batch costs at most the
 * one recipient being sent to, instead of the batch going out again.
 */
export async function processCampaignSendBatch(sendId: string) {
  const send = await prisma.campaignSend.findUniqueOrThrow({ where: { id: sendId }, include: { campaign: true } });
  if (send.status !== 'SENDING') {
    return { done: send.status !== 'PENDING', sentCount: send.sentCount, failedCount: send.failedCount, status: send.status };
  }

  const campaign = send.campaign;
  const recipientIds = (send.recipientIds as string[]) ?? [];
  const batchEnd = Math.min(send.sentCount + BATCH_SIZE, recipientIds.length);

  // SMS recipients are collected here and sent in a SINGLE bulk request after
  // the loop. Cellcast accepts every recipient in one call, so a 100-strong
  // batch costs one HTTP request instead of 100 — far faster, and much less
  // likely to trip provider rate limits. (Email stays per-recipient: each
  // message carries its own personalised unsubscribe link.)
  const smsRecipients: string[] = [];
  // Which recipients each number belongs to, to put failed texts against them.
  const byMobile = new Map<string, string[]>();
  // Recipients something failed for in this batch (counted once each).
  const failedIds = new Set<string>();

  try {
    for (let i = send.sentCount; i < batchEnd; i++) {
      // Claim this recipient first (see above). Not claimed: the send was
      // paused or cancelled, or another run has got here first.
      const claimed = await prisma.campaignSend.updateMany({
        where: { id: sendId, status: 'SENDING', sentCount: i },
        data: { sentCount: i + 1 },
      });
      if (claimed.count === 0) break;

      const recipient = await prisma.member.findUnique({ where: { id: recipientIds[i] } });
      // The list is fixed when the send starts: someone who has unsubscribed
      // since (a paused send can wait days) gets nothing.
      if (!recipient || !recipient.marketingOptIn) continue;
      if (
        campaign.sendEmail &&
        // Only to an address they've confirmed is theirs. A bounced address
        // is skipped, not the whole member: they may still get the text part.
        recipient.emailVerified &&
        !recipient.emailBounced &&
        (recipient.contactMethod === 'EMAIL_AND_SMS' || recipient.contactMethod === 'EMAIL' || campaign.ignorePreference)
      ) {
        try {
          const unsubscribeToken = jwt.sign({ memberId: recipient.id, purpose: 'unsubscribe' }, JWT_SECRET);
          const unsubscribeUrl = `${process.env.APP_URL}/unsubscribe?token=${unsubscribeToken}`;
          const html = resolveCampaignEmailHtml(
            {
              emailBody: campaign.emailBody,
              heading: campaign.heading,
              freeText: campaign.freeText,
              eventDetailsText: campaign.eventDetailsText,
              bookingLink: campaign.bookingLink,
              photoUrl: campaign.photoUrl,
              bannerImageUrl: campaign.bannerImageUrl,
              venueLogoUrl: campaign.venueLogoUrl,
            },
            unsubscribeUrl
          );
          // One line even for a blast saved before subjects were kept to one.
          await sendEmail({ to: recipient.email, subject: oneLine(campaign.subject ?? ''), html });
        } catch (err) {
          failedIds.add(recipient.id);
          // Only the mail server refusing the address itself marks it bounced;
          // a temporary failure leaves the member alone (src/lib/campaigns/sendFailure.ts).
          if (isPermanentAddressRejection(err)) {
            await prisma.member.update({
              where: { id: recipient.id },
              data: { emailBounced: true, bounceReason: 'Rejected on send' },
            });
          }
        }
      }
      if (
        campaign.sendSms &&
        // Only to a mobile they've confirmed: a mistyped number belongs to a stranger.
        recipient.mobileVerified &&
        (recipient.contactMethod === 'EMAIL_AND_SMS' || recipient.contactMethod === 'SMS' || campaign.ignorePreference)
      ) {
        if (recipient.mobile) {
          smsRecipients.push(recipient.mobile);
          byMobile.set(recipient.mobile, [...(byMobile.get(recipient.mobile) ?? []), recipient.id]);
        }
      }
    }
  } finally {
    // One request for the batch's texts — also when something went wrong
    // part-way, as those recipients are already claimed. sendSmsBulk returns
    // per-recipient failures rather than throwing, so an invalid or
    // unsubscribed number can't abort the batch and strand the rest of the send.
    if (smsRecipients.length > 0) {
      try {
        const result = await sendSmsBulk({ to: smsRecipients, body: withOptOut(campaign.smsBody ?? '') });
        if (result.failed.length > 0) {
          console.error(
            `Campaign send ${sendId}: ${result.failed.length} of ${smsRecipients.length} SMS recipient(s) rejected.`,
            result.failed
          );
          for (const f of result.failed) for (const id of byMobile.get(f.to) ?? []) failedIds.add(id);
        }
      } catch (err) {
        console.error(`Campaign send ${sendId}: the batch's texts couldn't be sent`, err);
        for (const ids of byMobile.values()) for (const id of ids) failedIds.add(id);
      }
    }
    // failedCount: how many of those claimed a message didn't reach, so
    // they're no longer counted as sent.
    if (failedIds.size > 0) {
      await prisma.campaignSend.update({ where: { id: sendId }, data: { failedCount: { increment: failedIds.size } } });
    }
  }

  // Everyone claimed: the send is finished (unless it was paused or cancelled
  // just now, in which case resuming finishes it).
  await prisma.campaignSend.updateMany({
    where: { id: sendId, status: 'SENDING', sentCount: { gte: recipientIds.length } },
    data: { status: 'SENT', completedAt: new Date() },
  });
  const now = await prisma.campaignSend.findUniqueOrThrow({ where: { id: sendId } });
  return { done: now.status === 'SENT' || now.status === 'CANCELLED', sentCount: now.sentCount, failedCount: now.failedCount, status: now.status };
}
