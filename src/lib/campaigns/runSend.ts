import { prisma } from '../prisma';
import { buildMemberWhere, MemberFilter } from '../memberFilter';
import { sendEmail } from '../emails/send';
import { sendSmsBulk, withOptOut } from '../sms/send';
import { resolveCampaignEmailHtml } from '../emails/campaignEmail';
import { cleanRichHtml } from '../richTextClean';
import { recipientFilter } from './audience';
import { isPermanentAddressRejection } from './sendFailure';
import { oneLine } from '../escapeHtml';
import { australianMobile } from '../mobile';
import jwt from 'jsonwebtoken';
import { withMobileMatches } from '../memberSearch';
import { maskMobile } from '../logMask';
import { blastFilterSchema, BAD_FILTER } from './fields';
import { waitForBlastSlot } from './pacing';
import type { Prisma } from '@prisma/client';

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
 * Tries per blast email when Mailgun says "try again later" (its limit of 26
 * recipients in 30 seconds): each waits until the moment it gives. Blasts
 * run in the background, so they can wait longer than an email a person is
 * waiting on. Still refused after that, the member is kept as "missed out"
 * (emailFailedIds), for History's "Send to the N who missed out".
 */
export const BLAST_EMAIL_ATTEMPTS = 4;

/** Member ids kept in a send's JSON column (recipientIds, emailFailedIds). */
export function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

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

  // The saved filter goes into the recipients query, so it is checked here
  // too: blasts saved before filters were checked on save could hold
  // anything. Fields the page never sends are dropped, as on save.
  const savedFilter = blastFilterSchema.safeParse(campaign.filter ?? {});
  if (!savedFilter.success) return { ok: false, error: BAD_FILTER };

  const where = buildMemberWhere(recipientFilter(await withMobileMatches(savedFilter.data as MemberFilter), campaign));
  const recipients = await prisma.member.findMany({ where, select: { id: true } });
  const recipientIds = recipients.map((r) => r.id);

  return createSend(campaignId, { filterSnapshot: campaign.filter as Prisma.InputJsonValue, recipientIds });
}

/**
 * A new send of this blast, unless it already has one going (or paused).
 * Checked with the blast locked, so two presses at once can't both start one.
 */
async function createSend(
  campaignId: string,
  data: { filterSnapshot: Prisma.InputJsonValue; recipientIds: string[]; retryOfId?: string },
): Promise<{ ok: true; sendId: string; totalRecipients: number } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`Campaign\` WHERE id = ${campaignId} FOR UPDATE`;
    const inFlight = await tx.campaignSend.findFirst({ where: { campaignId, status: { in: ['SENDING', 'PAUSED'] } } });
    if (inFlight) return { ok: false as const, error: SEND_IN_FLIGHT_ERROR };
    if (data.retryOfId && (await tx.campaignSend.findFirst({ where: { retryOfId: data.retryOfId } }))) {
      return { ok: false as const, error: ALREADY_RESENT_ERROR };
    }
    const send = await tx.campaignSend.create({
      data: {
        campaignId,
        filterSnapshot: data.filterSnapshot,
        recipientIds: data.recipientIds,
        totalRecipients: data.recipientIds.length,
        status: 'SENDING',
        ...(data.retryOfId ? { retryOfId: data.retryOfId } : {}),
      },
    });
    return { ok: true as const, sendId: send.id, totalRecipients: data.recipientIds.length };
  });
}

export const ALREADY_RESENT_ERROR = 'This send has already been sent again to the members who missed out.';
export const NOBODY_MISSED_ERROR = 'Nobody missed out on this send.';

/**
 * "Send to the N who missed out" (History): the blast's email again, to the
 * members a send's email didn't reach because Mailgun kept saying "try again
 * later". Email only: they had any text already. Once per send; the resend
 * can have its own. Each member is checked again as it reaches them, as in
 * any send (unsubscribed or bounced since: nothing).
 */
export async function startMissedSend(
  campaignId: string,
  sendId: string,
): Promise<{ ok: true; sendId: string; totalRecipients: number } | { ok: false; error: string; notFound?: boolean }> {
  const original = await prisma.campaignSend.findUnique({ where: { id: sendId } });
  if (!original || original.campaignId !== campaignId) return { ok: false, error: 'That send wasn’t found.', notFound: true };
  const missed = idList(original.emailFailedIds);
  if (missed.length === 0) return { ok: false, error: NOBODY_MISSED_ERROR };
  return createSend(campaignId, {
    filterSnapshot: (original.filterSnapshot ?? {}) as Prisma.InputJsonValue,
    recipientIds: missed,
    retryOfId: sendId,
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
  const recipientIds = idList(send.recipientIds);
  // A resend to those who missed out is email only (they had any text already).
  const sendSms = campaign.sendSms && !send.retryOfId;
  const batchEnd = Math.min(send.sentCount + BATCH_SIZE, recipientIds.length);

  // SMS recipients are collected here and sent in a SINGLE bulk request after
  // the loop. Cellcast accepts every recipient in one call, so a 100-strong
  // batch costs one HTTP request instead of 100 — far faster, and much less
  // likely to trip provider rate limits. (Email stays per-recipient: each
  // message carries its own personalised unsubscribe link.)
  const smsRecipients: string[] = [];
  // Members may share a mobile (Gil, Q21): each number gets the text once.
  const owners = sendSms ? await textOwners(recipientIds, campaign.ignorePreference) : null;
  // Which recipients each number belongs to, to put failed texts against them.
  const byMobile = new Map<string, string[]>();
  // Recipients something failed for in this batch (counted once each).
  const failedIds = new Set<string>();
  // Of those, the ones whose email Mailgun kept refusing for now (not a dead
  // address), kept on the send for "Send to the N who missed out".
  const emailMissedIds: string[] = [];

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
          const unsubscribeToken = jwt.sign({ memberId: recipient.id, purpose: 'unsubscribe' }, JWT_SECRET, { algorithm: 'HS256' });
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
            unsubscribeUrl,
            // Cleaned again as it goes out (it was when saved).
            cleanRichHtml,
          );
          // This sender's turn (src/lib/campaigns/pacing.ts): one blast email
          // every 1.5 seconds across the site, under Mailgun's limit.
          await waitForBlastSlot();
          // One line even for a blast saved before subjects were kept to one.
          // The one-click unsubscribe (the mail program's own button) uses the same token.
          await sendEmail({
            to: recipient.email, subject: oneLine(campaign.subject ?? ''), html,
            listUnsubscribe: `${process.env.APP_URL}/api/unsubscribe/one-click?token=${unsubscribeToken}`,
            attempts: BLAST_EMAIL_ATTEMPTS,
          });
        } catch (err) {
          failedIds.add(recipient.id);
          // Only the mail server refusing the address itself marks it bounced;
          // a temporary failure leaves the member alone (src/lib/campaigns/sendFailure.ts).
          if (isPermanentAddressRejection(err)) {
            await prisma.member.update({
              where: { id: recipient.id },
              data: { emailBounced: true, bounceReason: 'Rejected on send' },
            });
          } else {
            emailMissedIds.push(recipient.id);
          }
        }
      }
      if (
        sendSms &&
        // Only to a mobile they've confirmed: a mistyped number belongs to a stranger.
        recipient.mobileVerified &&
        (recipient.contactMethod === 'EMAIL_AND_SMS' || recipient.contactMethod === 'SMS' || campaign.ignorePreference)
      ) {
        if (recipient.mobile && (!owners || owners.get(numberKey(recipient.mobile)) === recipient.id)) {
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
          // The numbers masked (this runs from cron, into a log kept for weeks).
          console.error(
            `Campaign send ${sendId}: ${result.failed.length} of ${smsRecipients.length} SMS recipient(s) rejected.`,
            result.failed.map((f) => ({ to: maskMobile(f.to), reason: f.reason }))
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
    // Added to the list in one statement: another run of this send (the
    // scheduled job taking over) may be adding its own at the same moment.
    if (emailMissedIds.length > 0) {
      await prisma.$executeRaw`UPDATE \`CampaignSend\` SET \`emailFailedIds\` = JSON_MERGE_PRESERVE(COALESCE(\`emailFailedIds\`, JSON_ARRAY()), CAST(${JSON.stringify(emailMissedIds)} AS JSON)) WHERE \`id\` = ${sendId}`;
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

/** A number however it's written ("0412 345 678", "+61412345678"), for spotting a shared one. */
const numberKey = (mobile: string) => australianMobile(mobile) ?? mobile.replace(/\D/g, '');

/**
 * Two members may share a mobile (Gil, Q21), and the number used to get the
 * blast text once per member, each copy paid for. Now each number belongs to
 * the first member on the list who can get the text, and only they are
 * texted. Worked out afresh for each batch, from the whole list.
 */
async function textOwners(recipientIds: string[], ignorePreference: boolean): Promise<Map<string, string>> {
  const members = await prisma.member.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, mobile: true, mobileVerified: true, marketingOptIn: true, contactMethod: true },
  });
  const byId = new Map(members.map((m) => [m.id, m]));
  const owners = new Map<string, string>();
  for (const id of recipientIds) {
    const m = byId.get(id);
    if (!m?.mobile || !m.mobileVerified || !m.marketingOptIn) continue;
    if (!(m.contactMethod === 'EMAIL_AND_SMS' || m.contactMethod === 'SMS' || ignorePreference)) continue;
    const key = numberKey(m.mobile);
    if (!owners.has(key)) owners.set(key, m.id);
  }
  return owners;
}

