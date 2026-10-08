/**
 * Runs the three scheduled jobs on the server against made-up data, and
 * checks each one did its work (README.md):
 *   - reminders: a booking for an event 30 hours away gets its reminder;
 *   - blasts: a blast started for one member is sent and marked sent;
 *   - results: two people at a night two days ago who both chose "Date" are
 *     matched, and both result emails go.
 * Everything it makes is called "[Server check]" and is deleted at the end
 * (or with --cleanup, after an interrupted run). The two members' addresses
 * are @example.com, which accepts no mail: the emails go to Mailgun and stop
 * there, and Mailgun's reports of them test the bounce webhook as well.
 * Nothing is texted. Both events are hidden from the public site.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { loadEnv, section, info, messageOf } from './lib';

const MARK = '[Server check]';
const EMAIL_PREFIX = 'servercheck-';
const HOUR = 3600e3;
const DAY = 24 * HOUR;

let passed = 0;
let failed = 0;
const pass = (message: string) => { passed++; console.log(`[PASS]  ${message}`); };
const fail = (message: string) => { failed++; console.log(`[FAIL]  ${message}`); };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A job, as cron runs it (package.json: tsx src/scripts/<name>), with its output. */
function runJob(script: string): number | null {
  const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const run = spawnSync(tsx, [path.join('src', 'scripts', script)], { encoding: 'utf8', env: process.env, timeout: 10 * 60e3 });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();
  if (output) console.log(output.split('\n').slice(-25).map((line) => `        | ${line}`).join('\n'));
  return run.status;
}

/** Deletes everything a run made (and only that): it's all marked. */
async function cleanup(prisma: PrismaClient): Promise<number> {
  const memberIds = (await prisma.member.findMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: '@example.com' } }, select: { id: true } })).map((m) => m.id);
  const eventIds = (await prisma.event.findMany({ where: { name: { startsWith: MARK } }, select: { id: true } })).map((e) => e.id);
  const campaignIds = (await prisma.campaign.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } })).map((c) => c.id);
  await prisma.campaignSend.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  await prisma.match.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { memberAId: { in: memberIds } }, { memberBId: { in: memberIds } }] } });
  await prisma.rating.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { raterId: { in: memberIds } }, { ratedMemberId: { in: memberIds } }] } });
  await prisma.feedback.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { memberId: { in: memberIds } }] } });
  await prisma.booking.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { memberId: { in: memberIds } }] } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.venue.deleteMany({ where: { name: { startsWith: MARK }, events: { none: {} } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
  return memberIds.length + eventIds.length + campaignIds.length;
}

async function main() {
  loadEnv();
  const { prisma } = await import('../src/lib/prisma');
  const { startCampaignSend } = await import('../src/lib/campaigns/runSend');
  const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');

  if (process.argv.includes('--cleanup')) {
    console.log(`Removed ${await cleanup(prisma)} leftover record(s).`);
    await prisma.$disconnect();
    return;
  }
  await cleanup(prisma); // anything an interrupted run left

  const stop = () => {
    console.log('\nStopped: removing the made-up data...');
    cleanup(prisma).catch(() => {}).finally(() => process.exit(130));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  const emailOn = !!(process.env.MAILGUN_SMTP_USER && process.env.MAILGUN_SMTP_PASS);
  const tag = Date.now().toString(36);
  try {
    section('Made-up data');
    const city = (await prisma.city.findFirst({ where: { name: 'Sydney' } })) ?? (await prisma.city.findFirstOrThrow());
    const theme = await prisma.eventTheme.findFirstOrThrow();
    const venue = await prisma.venue.create({ data: { name: `${MARK} venue ${tag}`, cityId: city.id } });
    const person = (first: string, gender: 'MALE' | 'FEMALE') => prisma.member.create({
      data: {
        name: `${first} Servercheck`, gender, email: `${EMAIL_PREFIX}${tag}-${first.toLowerCase()}@example.com`, passwordHash: 'not-a-password',
        // A number set aside for fiction (ACMA); nothing is texted anyway.
        cityId: city.id, dateOfBirth: new Date('1990-05-05'), mobile: '0491 570 006',
        agreedTerms: true, emailVerified: true, mobileVerified: true, marketingOptIn: true,
      },
    });
    const alex = await person('Alex', 'MALE');
    const sam = await person('Sam', 'FEMALE');
    const event = (what: string, startsAt: Date) => prisma.event.create({
      data: {
        name: `${MARK} ${what} ${tag}`, themeId: theme.id, cityId: city.id, venueId: venue.id, startsAt,
        ageMin: 18, ageMax: 99, maxMen: 10, maxWomen: 10, cost: 0, visibility: 'NOT_PUBLIC', confirmed: true,
      },
    });

    // Results: a night two days ago; both checked in, and each chose "Date".
    const night = await event('results', new Date(Date.now() - 2 * DAY));
    for (const [i, m] of [alex, sam].entries()) {
      await prisma.booking.create({
        data: { eventId: night.id, memberId: m.id, badge: i + 1, status: 'CONFIRMED', paidAmount: 0, confirmedAt: new Date(), checkedIn: true, checkedInAt: night.startsAt },
      });
    }
    await prisma.rating.create({ data: { eventId: night.id, raterId: alex.id, ratedMemberId: sam.id, choice: 'DATE' } });
    await prisma.rating.create({ data: { eventId: night.id, raterId: sam.id, ratedMemberId: alex.id, choice: 'DATE' } });

    // Reminder: an event 30 hours away, with Sam booked.
    const soon = await event('reminder', new Date(Date.now() + 30 * HOUR));
    const soonBooking = await prisma.booking.create({
      data: { eventId: soon.id, memberId: sam.id, badge: 1, status: 'CONFIRMED', paidAmount: 0, confirmedAt: new Date() },
    });

    // Blast: to Alex only, by email only, started as "Send Blast Now" starts one.
    const campaign = await prisma.campaign.create({
      data: {
        title: `${MARK} ${tag}`, sendEmail: true, sendSms: false, subject: 'FastMatch server check (please ignore)',
        heading: 'Server check', freeText: 'An automated check of the blast sending job. Please ignore this email.', filter: { search: alex.email },
      },
    });
    const started = await startCampaignSend(campaign.id);
    info(`Members ${alex.email} and ${sam.email}; events #${night.number} (2 days ago) and #${soon.number} (in 30 hours), both hidden; a blast to Alex.`);
    if (!started.ok || started.totalRecipients !== 1) fail(`The blast didn't start with exactly 1 recipient: ${started.ok ? `${started.totalRecipients} recipient(s)` : started.error}`);
    info(emailOn ? 'Email is on: the emails really go to Mailgun (and stop there).' : 'Email is off here: emails are only written to the log.');

    section('1. Reminders job (send-reminders)');
    const remindersExit = runJob('sendReminders.ts');
    const reminded = (await prisma.booking.findUniqueOrThrow({ where: { id: soonBooking.id } })).reminderSent;
    if (remindersExit === 0 && reminded) pass(`Sam's reminder for event #${soon.number} was sent.`);
    else fail(`Sam's reminder wasn't sent (the job ended with code ${remindersExit}).`);

    section('2. Blast job (process-campaign-sends)');
    const blastExit = runJob('processCampaignSends.ts');
    const send = started.ok ? await prisma.campaignSend.findUnique({ where: { id: started.sendId } }) : null;
    // The every-2-minutes cron may have sent it first: the result is what counts.
    if (send?.status === 'SENT' && send.sentCount === 1 && send.failedCount === 0) pass('The blast went to its 1 recipient and is marked sent.');
    else fail(`The blast didn't finish: ${send ? `${send.status}, ${send.sentCount} of ${send.totalRecipients} done, ${send.failedCount} failed` : 'it never started'} (the job ended with code ${blastExit}).`);

    section('3. Results job (calculate-matches)');
    const resultsExit = runJob('calculateMatches.ts');
    const after = await prisma.event.findUniqueOrThrow({ where: { id: night.id } });
    const match = await prisma.match.findFirst({ where: { eventId: night.id } });
    if (after.matchesCalculated && match?.result === 'DATE') pass(`Event #${night.number}: Alex and Sam were matched as a date.`);
    else fail(`Event #${night.number} wasn't worked out as expected (calculated: ${after.matchesCalculated}, match: ${match?.result ?? 'none'}; the job ended with code ${resultsExit}).`);
    if (after.matchEmailsSent) pass('Both result emails were sent.');
    else fail('The result emails weren\'t all sent.');

    section('4. Bounce reports (Mailgun to the site)');
    if (!emailOn) info('Email is off here, so there are no bounce reports to wait for.');
    else {
      info('The emails went to @example.com, which accepts no mail. Waiting up to 4 minutes for Mailgun to report them...');
      let bounced = 0;
      for (let i = 0; i < 24 && bounced < 2; i++) {
        await sleep(10_000);
        bounced = await prisma.member.count({ where: { id: { in: [alex.id, sam.id] }, emailBounced: true } });
      }
      if (bounced === 2) pass('Mailgun reported the undeliverable emails, and the site marked both test members as bounced: the bounce webhook works.');
      else fail(`${bounced} of 2 bounce reports arrived in 4 minutes. In Mailgun (Sending → Webhooks), "Permanent failure" should point at ${appUrl}/api/webhooks/email-bounce, with its signing key in MAILGUN_WEBHOOK_SIGNING_KEY.`);
    }
  } catch (err) {
    fail(`The test stopped early: ${messageOf(err)}`);
  } finally {
    info(`Removed the made-up data (${await cleanup(prisma)} member, event and blast record(s)).`);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  await prisma.$disconnect();
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.log(`[FAIL]  ${messageOf(err)}`);
  process.exit(1);
});
