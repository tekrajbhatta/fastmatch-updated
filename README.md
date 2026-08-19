# fastmatch.com.au — codebase (in progress)

Started directly in this chat (no network access here, so nothing has been
installed or run/tested yet — that's the first thing your developer needs to
do). Built to match `fastmatch-com-au-spec.md` and follow the same stack/
patterns as the FastmatchLive codebase.

## What's actually written so far

- **`prisma/schema.prisma`** — the full database schema: Member (with
  isAdmin), City, EventTheme, EventSeries, Event, Booking, Rating, Match,
  DiscountCode. Ratings are stored as proper rows (not the old
  comma-separated text), and there is nowhere in this schema that a raw card
  number/CVV can be stored — payments go through Stripe only.
- **`src/lib/auth.ts`** — session handling (JWT in an httpOnly cookie) and
  admin check. Admins are just Members with `isAdmin: true` — no separate
  admin table, since this is a single-operator business.
- **`src/lib/calculateMatches.ts`** — the actual Date/Friend/No matching
  algorithm (mutual Date → date match, Date+Friend or mutual Friend → friend
  match, otherwise no match).
- **`src/scripts/calculateMatches.ts`** — the nightly job that finds events
  from today and calculates their matches at midnight.
- **`src/lib/sendMatchEmails.ts`** — groups matches by attendee, ready to
  send, but the actual send call is a stub until an email provider is wired in.
- **Auth routes**: register (enforces 18+ and T&Cs acceptance), login,
  forgot-password, reset-password.
- **Event routes**: admin create (single or repeat series), admin list, admin
  edit/delete (delete-if-no-bookings, else cancel — matches the old system's
  real behaviour), bulk series actions (delete/publish/unpublish the whole
  series at once, same pattern as FastmatchLive).
- **Booking + Stripe**: create a booking (capacity check, badge assignment,
  discount code validation), Stripe Checkout session, and the webhook that
  only confirms the booking once Stripe actually confirms payment (per the
  T&Cs: "your card will not be debited until your place is confirmed").
- **Check-in**: the shared-QR check-in endpoint and the live roster endpoint
  (only checked-in attendees appear, matching the event-night design).
- **Match submission**: "Submit Matches" endpoint, and the admin's manual
  "close event now & calculate early" override.
- **Discount codes**: list/create/edit/delete — editing an existing (including
  expired) code works instead of only being able to create new ones.
- **Members**: search/filter with summary totals (count, gender split, total
  matches) alongside the results — **paginated** (50 per page) and totals
  computed via database-level aggregates rather than loading rows, since
  the real member count is 64,286 and only going to grow. Individual member
  detail view (`GET /api/admin/members/:id`, includes booking and match
  history — "click a member to view their details" on the real screen).
  **Filter and Blast** (`POST /api/admin/members/filter-and-blast`) — takes
  the current Members filter and creates a new draft blast pre-filled with
  it, matching the real shortcut button exactly.
- **Email/SMS marketing (matches the real old Blast system, including its
  reusable-template behaviour)**: `src/lib/memberFilter.ts` is the one
  shared filtering implementation used by both Members and Campaigns. A
  **Campaign is reusable** — it can be sent multiple times, each an
  independent `CampaignSend` row (its own status/progress/recipient list),
  exactly like the real system's Details/Send/History tabs. "Unused" means
  zero sends yet; once sent at least once, direct Edit/Delete are replaced
  by **Duplicate** (`/duplicate`, fresh editable copy) and **Stop re-using
  blast** (`/stop-reusing`, sets `reusable: false`) — matching the real
  action bar exactly. `sendEmail`/`sendSms` are independent toggles (can
  both be on). Flow: create → **preview** (`/preview`, accepts an
  in-progress filter before it's saved) → **test send** (`/test-send`, to
  any freely-typed address/number, not a fixed one) → edit if still Unused →
  **Send Blast Now** (`/send`, starts a new `CampaignSend`) → **pause/
  resume/cancel** per-send (`/sends/:sendId/pause` etc.) → **History**
  (`GET /sends`, every past send of this blast).

  **Batched, not one long loop**: real list sizes run 100-5,000, which risks
  a serverless timeout if sent in one request. `processCampaignSendBatch()`
  handles 100 recipients per call and returns; `src/scripts/
  processCampaignSends.ts` is a scheduled job (run it every 1-2 minutes,
  same mechanism as the midnight match-calculation job) that drives every
  in-progress send forward until complete. `/send` and `/resume` process one
  batch immediately for responsiveness, then the scheduled job takes over.
  Pause/cancel take effect at the next batch boundary, not instantly
  mid-batch. `GET /api/admin/sms-credits` is a placeholder for the provider
  balance banner ("194.250 credits remaining"). Email sending is real
  (Mailgun over SMTP); SMS has real Clickatell and Twilio implementations.
  All fall back to `console.log` when credentials are absent.
- **Bounce handling**: `src/app/api/webhooks/email-bounce/route.ts` — instead
  of routing bounces to a separate inbox for a human to read (the old
  system's approach), the email provider posts bounce events here
  automatically. The member's `emailBounced` flag gets set immediately and
  they're excluded from all future campaign sends — no inbox involved at all.
  Immediate send-time failures are also caught and flagged the same way.

- **Standard admin/compliance routes**: forgot-password + reset-password
  (token-based, for a forgotten password), change-password (for a logged-in
  member from Account), unsubscribe — both the emailed token-link version
  (`/api/unsubscribe`) and the in-app version from Account
  (`/api/account/unsubscribe`), and Contact Us (`/api/contact-us`, sends to
  gil@fastmatch.com.au). T&Cs acceptance is already enforced at registration
  (see auth routes above). Privacy Policy and Terms & Conditions are
  **content-only** — the text is drafted in the spec doc but there's no page
  to display it yet (falls under the UI pages gap below).
- **Email templates**: `src/lib/emails/` — booking confirmation, pre-event
  reminder, event change notification, match results, and campaign/marketing
  templates, all in a shared layout matching the real old-system emails'
  structure and tone (booking confirmation and match results are wired into
  the actual booking/matching flow; the reminder and change-notification
  templates exist but aren't triggered by anything yet — no reminder
  scheduler or event-edit-triggers-notification logic written). The
  provider call itself (`src/lib/emails/send.ts`) is still a stub.

## Avoiding spam flags

Real answer to "how do we avoid being labeled as spam" — mostly DNS/provider
setup, not app code, but worth having written down:

- **Authenticate the sending domain**: SPF, DKIM, and DMARC DNS records for the
  Mailgun sending domain (currently `mg.fastmatch.live`; a `mg.fastmatch.com.au`
  subdomain is planned before launch). Mailgun provides the exact records.
  Without these, mail providers distrust the sender by default. The sender
  address must always match a Mailgun-verified domain — it is read from
  `EMAIL_FROM_ADDRESS`, never hard-coded.
- **Send from a real, monitored address** (e.g. `no-reply@fastmatch.com.au`
  for transactional, maybe `news@fastmatch.com.au` for campaigns) — not a
  freemail address.
- **Every marketing email needs a working unsubscribe link** (already built)
  — providers and spam filters both check for this.
- **List hygiene matters most**: sending to bounced/invalid addresses
  repeatedly is one of the biggest drivers of being flagged. The bounce
  webhook above handles this automatically going forward.
- **Warm up sending volume** on a new domain/provider — don't blast 3,000
  emails on day one; ramp up over the first couple of weeks.
- **Avoid spam-trigger patterns** in subject lines/content (ALL CAPS,
  excessive exclamation marks, "FREE" in the subject line) — the old
  "HALF PRICE LAUNCH OFFER!" style subject lines are worth toning down
  slightly for deliverability, even if the offer itself stays the same.

## Communication flow (confirmed)

1. **Register** → welcome email with verification link AND an SMS with a
   6-digit code — **both** must be completed (`emailVerified` +
   `mobileVerified`) before the member can book an event (enforced in the
   booking route). `verify-mobile` and `resend-mobile-code` routes handle the
   SMS side. ✅ wired
2. **Book** → booking confirmation email with check-in link (`eventEmails.ts`
   `bookingConfirmationEmail` via `sendBookingConfirmation.ts`) ✅ wired
3. **Event date/time changed** → email + SMS to every confirmed booking
   (`eventChangeEmail` + `eventChangeSms`, triggered from the admin event
   PATCH route) ✅ wired
4. **Event invitations** (marketing, to entice bookings) → Campaign system
   (`campaignEmail.ts`, admin creates + sends against a filtered member list)
   ✅ wired
5. **Matches after the event** → match results email (`matchResultsEmail.ts`
   via `sendMatchEmails.ts`) ✅ wired

All five are wired end-to-end in terms of logic/templates, and the provider
connections are now real: `src/lib/emails/send.ts` sends via Mailgun SMTP
(nodemailer), and `src/lib/sms/send.ts` has working Clickatell and Twilio
paths selected by `SMS_PROVIDER`. Each falls back to `console.log` when its
credentials are unset, so local dev and CI never send anything.

- **Member import**: `src/scripts/importMembers.ts` (`npm run
  import-members -- path/to/file.csv`) — bulk-imports members from a CSV,
  in batches of 500 (built for the ~64k old-database migration, but works
  for any list). Skips duplicates by email, skips and logs invalid rows
  (bad city/date/missing fields) without failing the whole run, never
  imports card data (not even a column for it), never invents a password
  (imported members use "Forgot password" to set one), and marks imported
  members as email+mobile verified but **not** as having agreed to this
  site's T&Cs — they accept on first login via
  `POST /api/account/accept-terms`, which the booking route now also gates
  on alongside verification.

## What's not written yet

Registration/login/booking/admin **UI pages** (everything above is API routes
only, no actual screens yet), the event-night check-in page UI, admin
Reports (summary + per-event), the actual email/SMS provider connections, a
reminder-email scheduler (template exists, nothing triggers it), CSV export
for filtered members, and the legal pages (T&Cs/Privacy text is already
drafted in the spec doc, just needs wiring into actual pages).

## Known issue to fix before running — Next.js 15 params signature

`package.json` specifies Next.js 15, but **all 20 dynamic routes in this
codebase** (anything with `[id]`, `[eventId]`, etc.) use the pre-15 params
signature: `{ params }: { params: { id: string } }`. Next.js 15 made
`params` a Promise — the correct signature is
`{ params }: { params: Promise<{ id: string }> }` with `const { id } =
await params;` inside the handler. This will fail to build as-is. Either
fix all 20 route files to the Next 15 signature, or pin `next` to `^14.0.0`
in package.json instead (simpler if there's no reason to be on 15
specifically) — your developer's call, but this needs a decision before
the first `npm run build`.

## First steps for your developer

1. `npm install`
2. Set up a MySQL database, put its connection string in `.env` as `DATABASE_URL`
3. Also set in `.env`: `JWT_SECRET`, `APP_URL`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, and for the providers: `MAILGUN_SMTP_USER` /
   `MAILGUN_SMTP_PASS` / `EMAIL_FROM_ADDRESS` (email) and
   `SMS_PROVIDER_API_KEY` / `SMS_PROVIDER` (SMS) — both features work without
   these set (fall back to console.log stubs), so they're not required to
   get the app running, only to actually send anything
4. `npm run prisma:migrate` to create the tables from the schema
5. Continue building out the UI pages listed above — the API routes already
   written show the intended pattern/conventions to follow
6. See `fastmatch-com-au-deployment-guide.md` for hosting/launch steps once
   the app is further along
