/**
 * The site's own checks on the server: its settings, what the data shows
 * about the scheduled jobs, Stripe, email, text messages and uploaded images.
 * Read-only: it changes nothing, and never prints a password or key.
 * Run by run-checks.sh (README.md), as the site's user, from its folder.
 */
import fs from 'fs';
import path from 'path';
import type Stripe from 'stripe';
import { loadEnv, section, ok, look, info, printTally, ago, sydney, messageOf } from './lib';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
/** The events the site's Stripe webhook needs (src/app/api/stripe/webhook/route.ts). */
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
];
/** What was agreed for Stripe's payment page (8 Oct). */
const AGREED = { name: 'FastMatch', descriptor: 'FASTMATCH', accent: '#3d1e6d', background: ['#f1e9f8', '#ffffff'], methods: ['card', 'apple_pay', 'google_pay'] };

async function main() {
  loadEnv();
  const { prisma } = await import('../src/lib/prisma');
  const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  const now = new Date();

  // ---------------------------------------------------------------- settings
  section('A. Settings in shared/.env (secret values are never shown)');
  const required: [string, string][] = [
    ['DATABASE_URL', 'the database'], ['JWT_SECRET', 'logins and emailed links'], ['APP_URL', 'links in emails and texts'],
    ['UPLOAD_DIR', 'uploaded images'], ['STRIPE_SECRET_KEY', 'payments'], ['STRIPE_WEBHOOK_SECRET', 'payment confirmations'],
    ['MAILGUN_SMTP_HOST', 'email'], ['MAILGUN_SMTP_PORT', 'email'], ['MAILGUN_SMTP_USER', 'email'], ['MAILGUN_SMTP_PASS', 'email'],
    ['EMAIL_FROM_ADDRESS', 'the email sender'], ['MAILGUN_WEBHOOK_SIGNING_KEY', 'bounce reports from Mailgun'],
    ['CELLCAST_API_KEY', 'text messages'], ['CELLCAST_SENDER_ID', 'the name texts come from'],
  ];
  for (const [name, what] of required) {
    if (process.env[name]?.trim()) ok(`${name} is set (${what})`);
    else look(`${name} is not set (${what})`);
  }
  for (const name of ['APP_URL', 'UPLOAD_DIR', 'EMAIL_FROM_ADDRESS', 'CELLCAST_SENDER_ID', 'EVENT_TIME_ZONE']) {
    info(`${name} = ${process.env[name] ? JSON.stringify(process.env[name]) : '(not set)'}`);
  }
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  info(`Stripe key: ${/^(sk|rk)_live_/.test(key) ? 'LIVE (real payments)' : /^(sk|rk)_test_/.test(key) ? 'TEST (sandbox: test cards only)' : 'not recognised'}`);
  for (const name of ['RESEND_API_KEY', 'SMS_PROVIDER', 'SMS_PROVIDER_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']) {
    if (name in process.env) info(`${name} is still in .env, but the site no longer uses it (it can be deleted)`);
  }

  // ---------------------------------------------------------------- time zone
  section('B. Time zone');
  info(`The server's clock, as the site sees it: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  info(`Reports and the results job count days in: ${process.env.EVENT_TIME_ZONE || 'Australia/Sydney'}`);
  info('Event times, reminders and results use each event city\'s own time zone, whatever the server\'s clock is set to.');

  // ---------------------------------------------------------------- the jobs, by their results
  section('C. Scheduled jobs: what the data shows');
  const { eventsDueForResults, eventsWithResultsToResend, resultsDue } = await import('../src/lib/nightlyResults');
  const { endOfEventNight } = await import('../src/lib/eventNight');
  const due = (await prisma.event.findMany({ where: eventsDueForResults(now), include: { city: true } })).filter((e) => resultsDue(e, now));
  const overdue = due.filter((e) => now.getTime() - endOfEventNight(e).getTime() > 2 * HOUR);
  if (overdue.length) {
    look(`Results job: ${overdue.length} event(s) still have no results more than 2 hours after their night ended: `
      + overdue.map((e) => `#${e.number} ${e.city.name} ${sydney(e.startsAt)} (night ended ${ago(endOfEventNight(e), now)})`).join('; '));
  } else ok(`Results job: no event is waiting for its results${due.length ? ` (${due.length} became due in the last 2 hours)` : ''}.`);
  const toResend = await prisma.event.findMany({ where: eventsWithResultsToResend(now) });
  if (toResend.length) look(`Results job: ${toResend.length} event(s) have result emails still to go out: ${toResend.map((e) => `#${e.number}`).join(', ')}`);
  else ok('Results job: every result email has gone out.');

  const missedReminders = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED', reminderSent: false, createdAt: { lt: new Date(now.getTime() - 2 * HOUR) },
      event: { startsAt: { gt: new Date(now.getTime() + DAY), lte: new Date(now.getTime() + 46 * HOUR) }, status: { not: 'CANCELLED' }, draft: false },
    },
    include: { event: true },
  });
  const inWindow = await prisma.booking.count({
    where: { status: 'CONFIRMED', event: { startsAt: { gt: new Date(now.getTime() + DAY), lte: new Date(now.getTime() + 48 * HOUR) }, status: { not: 'CANCELLED' }, draft: false } },
  });
  if (missedReminders.length) {
    look(`Reminders job: ${missedReminders.length} booking(s) should have had their reminder by now: events ${[...new Set(missedReminders.map((b) => `#${b.event.number}`))].join(', ')}`);
  } else ok(`Reminders job: no reminder is overdue (${inWindow} booking(s) are for events 24 to 48 hours away).`);

  const sending = await prisma.campaignSend.findMany({ where: { status: 'SENDING' }, include: { campaign: true } });
  for (const s of sending) {
    // 100 recipients per run, a run every 2 minutes, and some leeway.
    const expectedMinutes = Math.ceil(s.totalRecipients / 100) * 2 + 15;
    const minutes = (now.getTime() - s.startedAt.getTime()) / 60000;
    const line = `"${s.campaign.title}": ${s.sentCount} of ${s.totalRecipients} done, started ${ago(s.startedAt, now)}`;
    if (minutes > expectedMinutes) look(`Blast job: a send looks stuck: ${line}`);
    else info(`Blast job: sending now: ${line}`);
  }
  if (!sending.length) ok('Blast job: no blast is part-way through sending.');

  // ---------------------------------------------------------------- Stripe
  section('D. Payments (Stripe)');
  if (!key) look('No Stripe key, so payments can\'t be checked.');
  else {
    const { getStripe, isOurCheckoutSession } = await import('../src/lib/stripe');
    const stripe = getStripe();
    try {
      const account = await stripe.accounts.retrieve();
      const name = account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? '';
      const descriptor = account.settings?.payments?.statement_descriptor ?? '';
      const branding = account.settings?.branding;
      info(`Business name: "${name}", bank statement: "${descriptor}", shortened: "${account.settings?.card_payments?.statement_descriptor_prefix ?? ''}"`);
      info(`Support email: ${account.business_profile?.support_email ?? '(none)'}, website: ${account.business_profile?.url ?? '(none)'}`);
      info(`Branding: background ${branding?.primary_color ?? '(default)'}, button ${branding?.secondary_color ?? '(default)'}, icon ${branding?.icon ? 'uploaded' : 'none'}, logo ${branding?.logo ? 'uploaded' : 'none'}`);
      if (name === AGREED.name) ok('The payment page shows the name "FastMatch".'); else look(`The business name is "${name}"; agreed: "${AGREED.name}" (Dashboard step 2).`);
      if (descriptor === AGREED.descriptor) ok('Bank statements show "FASTMATCH".'); else look(`The statement descriptor is "${descriptor}"; agreed: "${AGREED.descriptor}" (Dashboard step 2).`);
      if ((branding?.secondary_color ?? '').toLowerCase() === AGREED.accent) ok('The Pay button is plum.'); else look(`The accent colour is ${branding?.secondary_color ?? '(default)'}; agreed: #3D1E6D (Dashboard step 1).`);
      if (AGREED.background.includes((branding?.primary_color ?? '').toLowerCase())) ok('The page background is the agreed colour.'); else look(`The brand colour is ${branding?.primary_color ?? '(default)'}; agreed: #F1E9F8 or #FFFFFF (Dashboard step 1).`);
      if (branding?.icon && branding?.logo) ok('The icon and logo are uploaded.'); else look('The icon or the logo isn\'t uploaded yet (Dashboard step 1).');
    } catch (err) {
      look(`Couldn't read the Stripe account's settings: ${messageOf(err)}`);
    }

    try {
      const configs = await stripe.paymentMethodConfigurations.list({ limit: 20 });
      const config = configs.data.find((c) => c.is_default) ?? configs.data[0];
      if (!config) look('No payment method settings found.');
      else {
        const offered: string[] = [];
        for (const [method, value] of Object.entries(config as unknown as Record<string, unknown>)) {
          const v = value as { available?: boolean; display_preference?: unknown } | null;
          if (v && typeof v === 'object' && 'display_preference' in v && v.available) offered.push(method);
        }
        info(`Ways to pay offered on the payment page: ${offered.join(', ') || '(none)'}`);
        const extra = offered.filter((m) => !AGREED.methods.includes(m));
        if (!offered.includes('card')) look('Cards are switched off!');
        if (extra.length) look(`Still switched on: ${extra.join(', ')}; agreed: cards, Apple Pay and Google Pay only (Dashboard step 3).`);
        else if (offered.includes('card')) ok('Only cards, Apple Pay and Google Pay are offered.');
      }
    } catch (err) {
      look(`Couldn't read the payment method settings: ${messageOf(err)}`);
    }

    try {
      const endpoints = await stripe.webhookEndpoints.list({ limit: 50 });
      const want = `${appUrl}/api/stripe/webhook`;
      for (const w of endpoints.data) info(`Webhook endpoint: ${w.url} (${w.status}): ${w.enabled_events.join(', ')}`);
      const ours = endpoints.data.filter((w) => w.url.replace(/\/+$/, '') === want);
      if (!ours.length) look(`No webhook endpoint points at ${want}, so payments won't confirm bookings.`);
      for (const w of ours) {
        const missing = WEBHOOK_EVENTS.filter((e) => !w.enabled_events.includes(e) && !w.enabled_events.includes('*'));
        if (w.status !== 'enabled') look(`The webhook endpoint for this site is ${w.status}.`);
        else if (missing.length) look(`The webhook endpoint for this site doesn't send: ${missing.join(', ')}`);
        else ok('The webhook endpoint for this site is on, and sends all four events the site needs.');
      }
    } catch (err) {
      look(`Couldn't read the webhook endpoints: ${messageOf(err)}`);
    }

    try {
      const since = Math.floor((now.getTime() - 30 * DAY) / 1000);
      const recent = await stripe.events.list({ type: 'checkout.session.*', created: { gte: since }, limit: 100 });
      const failed = await stripe.events.list({ type: 'checkout.session.*', created: { gte: since }, delivery_success: false, limit: 100 });
      const isOurs = (e: Stripe.Event) => isOurCheckoutSession(e.data.object as Stripe.Checkout.Session);
      const ourRecent = recent.data.filter(isOurs);
      const ourFailed = failed.data.filter(isOurs);
      const stillTrying = ourRecent.filter((e) => e.pending_webhooks > 0);
      info(`Payment events for this site in the last 30 days: ${ourRecent.length}${recent.has_more ? '+' : ''}`);
      if (ourFailed.length) {
        look(`${ourFailed.length} payment event(s) couldn't be delivered to a webhook at first: `
          + ourFailed.slice(0, 8).map((e) => `${e.type} ${sydney(new Date(e.created * 1000))}`).join('; ')
          + ' (Stripe retries for 3 days; Dashboard → Developers → Webhooks shows why)');
      } else ok('Every payment event of the last 30 days reached the webhook.');
      if (stillTrying.length) look(`${stillTrying.length} payment event(s) are still waiting to be delivered.`);
    } catch (err) {
      look(`Couldn't read the payment events: ${messageOf(err)}`);
    }

    // Bookings still waiting for payment, against what Stripe says happened.
    const pending = await prisma.booking.findMany({
      where: { status: 'PENDING', stripePaymentIntentId: { startsWith: 'cs_' }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      include: { event: true }, orderBy: { createdAt: 'desc' }, take: 50,
    });
    const paidButPending: string[] = [];
    let unknown = 0;
    for (const b of pending) {
      try {
        const s = await stripe.checkout.sessions.retrieve(b.stripePaymentIntentId!);
        if (s.payment_status === 'paid') paidButPending.push(`booking ${b.id} (event #${b.event.number}, ${ago(b.createdAt, now)})`);
      } catch {
        unknown++; // a payment page from the other mode (test or live)
      }
    }
    if (paidButPending.length) look(`Paid in Stripe but not confirmed on the site (a missed webhook): ${paidButPending.join('; ')}`);
    else ok(`None of the ${pending.length} unconfirmed booking(s) with a payment page has been paid.`);
    if (unknown) info(`${unknown} payment page(s) couldn't be looked up with this key (made in the other mode).`);
    const stale = pending.filter((b) => now.getTime() - b.createdAt.getTime() > HOUR);
    if (stale.length) look(`${stale.length} unpaid booking(s) are over an hour old; Stripe's "expired" event should have removed them after 30 minutes.`);
    const confirmedByStripe = await prisma.booking.count({ where: { status: 'CONFIRMED', stripePaymentIntentId: { startsWith: 'cs_' }, confirmedAt: { gte: new Date(now.getTime() - 30 * DAY) } } });
    info(`Bookings confirmed by Stripe payments in the last 30 days: ${confirmedByStripe}`);
  }

  // ---------------------------------------------------------------- email
  section('E. Email (Mailgun)');
  const smtpUser = process.env.MAILGUN_SMTP_USER;
  const smtpPass = process.env.MAILGUN_SMTP_PASS;
  if (!smtpUser || !smtpPass) look('No Mailgun login: emails are not being sent (they only go to the log).');
  else {
    try {
      // As src/lib/emails/send.ts connects; verify() logs in without sending.
      const nodemailer = (await import('nodemailer')).default;
      const port = Number(process.env.MAILGUN_SMTP_PORT || 587);
      const transport = nodemailer.createTransport({ host: process.env.MAILGUN_SMTP_HOST || 'smtp.mailgun.org', port, secure: port === 465, auth: { user: smtpUser, pass: smtpPass } });
      await transport.verify();
      ok('Mailgun accepted the site\'s login (nothing was sent).');
    } catch (err) {
      look(`Mailgun refused the login, or couldn't be reached: ${messageOf(err)}`);
    }
  }
  const bounced = await prisma.member.count({ where: { emailBounced: true } });
  info(`Members whose email Mailgun reported as undeliverable: ${bounced}`);

  // ---------------------------------------------------------------- texts
  section('F. Text messages (Cellcast)');
  const sender = process.env.CELLCAST_SENDER_ID?.trim();
  if (sender) ok(`Texts come from the name "${sender}". Members can't reply to a name, so every blast text gets the opt-out link.`);
  else look('No CELLCAST_SENDER_ID: texts come from Cellcast\'s shared number instead of "Fastmatch".');
  if (process.env.CELLCAST_API_KEY) {
    try {
      const res = await fetch(process.env.CELLCAST_ACCOUNT_URL || 'https://api.cellcast.com/api/v1/apiClient/account', {
        headers: { Authorization: `Bearer ${process.env.CELLCAST_API_KEY}`, Accept: 'application/json' },
      });
      const body = (await res.json().catch(() => null)) as { data?: { sms_balance?: unknown } } | null;
      const credits = body?.data?.sms_balance;
      if (res.ok && typeof credits === 'number') ok(`Cellcast accepted the key: ${credits} SMS credits left.`);
      else look(`Cellcast didn't accept the key (HTTP ${res.status}).`);
    } catch (err) {
      look(`Couldn't reach Cellcast: ${messageOf(err)}`);
    }
  }

  // ---------------------------------------------------------------- uploads
  section('G. Uploaded images');
  const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  let files = new Set<string>();
  try {
    files = new Set(fs.readdirSync(dir));
    info(`${files.size} file(s) in ${dir}`);
  } catch (err) {
    look(`Can't read the uploads folder ${dir}: ${messageOf(err)}`);
  }
  const used: { where: string; url: string }[] = [];
  const add = (where: string, url: string | null) => { if (url) used.push({ where, url }); };
  for (const e of await prisma.event.findMany({ where: { photoUrl: { not: null } }, select: { number: true, photoUrl: true } })) add(`event #${e.number} photo`, e.photoUrl);
  for (const v of await prisma.venue.findMany({ select: { name: true, logoUrl: true, imageUrl: true } })) { add(`venue "${v.name}" logo`, v.logoUrl); add(`venue "${v.name}" picture`, v.imageUrl); }
  for (const c of await prisma.campaign.findMany({ select: { title: true, photoUrl: true, bannerImageUrl: true, venueLogoUrl: true } })) {
    add(`blast "${c.title}" photo`, c.photoUrl); add(`blast "${c.title}" banner`, c.bannerImageUrl); add(`blast "${c.title}" venue logo`, c.venueLogoUrl);
  }
  for (const t of await prisma.campaignTemplate.findMany({ select: { title: true, photoUrl: true, bannerImageUrl: true } })) {
    add(`template "${t.title}" photo`, t.photoUrl); add(`template "${t.title}" banner`, t.bannerImageUrl);
  }
  const uploads = used.map((u) => ({ ...u, file: u.url.match(/\/api\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp))(?:[?#]|$)/)?.[1] })).filter((u) => u.file);
  const missing = uploads.filter((u) => !files.has(u.file!));
  if (missing.length) look(`${missing.length} image(s) the site uses aren't in the uploads folder: ${missing.slice(0, 10).map((u) => u.where).join('; ')}`);
  else ok(`All ${uploads.length} uploaded image(s) the site uses are in the uploads folder.`);
  const otherSites = [...new Set(uploads.map((u) => { try { return new URL(u.url).host; } catch { return ''; } }).filter((h) => h && appUrl && h !== new URL(appUrl).host))];
  if (otherSites.length) info(`Some images are linked at another address: ${otherSites.join(', ')} (they keep working while that address does).`);

  // ---------------------------------------------------------------- saved blasts
  section('H. Saved blasts and templates');
  const { mentionsReplyStop } = await import('../src/lib/sms/optOut');
  const tag = /<\/?[a-z][a-z0-9]*\b[^>]*>/i;
  const texts = [
    ...(await prisma.campaign.findMany({ select: { title: true, sendSms: true, smsBody: true, heading: true, freeText: true, eventDetailsText: true } })).map((c) => ({ kind: 'blast', ...c })),
    ...(await prisma.campaignTemplate.findMany({ select: { title: true, smsBody: true, heading: true, freeText: true, eventDetailsText: true } })).map((t) => ({ kind: 'template', sendSms: true, ...t })),
  ];
  const stop = texts.filter((t) => t.smsBody && mentionsReplyStop(t.smsBody));
  if (stop.length) look(`These texts ask members to reply STOP, which they can't (the opt-out link is added anyway; Gil may want to reword them): ${stop.map((t) => `${t.kind} "${t.title}"`).join('; ')}`);
  else ok('No saved text asks members to reply STOP.');
  const withTags = texts.filter((t) => [t.heading, t.freeText, t.eventDetailsText].some((v) => v && tag.test(v)));
  if (withTags.length) look(`These have HTML tags in their heading, text or event details, which emails show as typed: ${withTags.map((t) => `${t.kind} "${t.title}"`).join('; ')}`);
  else ok('No saved blast or template has HTML tags in its text.');

  // ---------------------------------------------------------------- events
  section('I. Events');
  const noPlaces = await prisma.event.findMany({ where: { OR: [{ maxMen: 0 }, { maxWomen: 0 }] }, select: { number: true, name: true } });
  if (noPlaces.length) look(`Event(s) with 0 places for men or women (every event needs at least 1 of each now): ${noPlaces.map((e) => `#${e.number} ${e.name}`).join('; ')}`);
  else ok('Every event has places for both men and women.');
  const upcoming = await prisma.event.count({ where: { startsAt: { gt: now }, draft: false, status: { not: 'CANCELLED' } } });
  const members = await prisma.member.count({ where: { isAdmin: false } });
  info(`Upcoming events: ${upcoming}; members: ${members}`);

  printTally();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.log(`[CHECK] The checks stopped early: ${messageOf(err)}`);
  process.exit(1);
});
