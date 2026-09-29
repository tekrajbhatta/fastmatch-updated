/**
 * LOCAL DEVELOPMENT ONLY — fills the database with realistic demo data so the
 * admin screens can be tried out: members, venues, events in every colour
 * group on /admin/events, bookings with each payment method, blasts, and
 * discount codes.
 *
 *   npm run dummy-data            # remove the previous demo data, insert fresh
 *   npm run dummy-data -- --remove  # remove the demo data only
 *
 * Refuses to run against anything but a database on this machine.
 *
 * Every row it creates is recognisable, so a re-run replaces exactly what it
 * made last time:
 *   - members      email ends in @example.com (a reserved domain — mail to it
 *                  can never be delivered)
 *   - venues       the DEMO_VENUES names below, in their cities
 *   - events       every event at one of those venues — INCLUDING any you
 *                  create there yourself while testing
 *   - blasts       title starts with "[Demo]"
 *   - discounts    code starts with "DEMO"
 *
 * Mobile numbers come from ACMA's list of numbers reserved for fiction, so
 * even with a live SMS provider configured nobody real could be texted.
 *
 * Dates are relative to today, so re-running keeps every colour group on
 * /admin/events populated.
 */
import { PrismaClient, Gender, ContactMethod, PaymentMethod, BookingStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const DEMO_PASSWORD = 'Demo1234!';
const EMAIL_DOMAIN = '@example.com';

// ---------------------------------------------------------------- safety ---

function assertLocalDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run: NODE_ENV is production.');
  }
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('Refusing to run: DATABASE_URL is missing or unreadable.');
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to run: database host "${host}" is not this machine.`);
  }
}

// ----------------------------------------------------------------- dates ---

const DAY = 24 * 60 * 60 * 1000;

/** Minutes Sydney is ahead of UTC at a given instant (600 or 660). */
function sydneyOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT+10:00"
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 600;
  return (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** hh:mm Sydney time, `days` from today — so events read "7:30 pm" to Gil. */
function sydneyAt(days: number, hh: number, mm = 0): Date {
  const day = new Date(Date.now() + days * DAY);
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(day);
  const wall = `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  // Guess with +10, then correct for daylight saving on that exact date.
  const guess = new Date(`${wall}+10:00`);
  const off = sydneyOffsetMinutes(guess);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return new Date(`${wall}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`);
}

function yearsAgo(years: number, extraDays = 0): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - extraDays);
  // UTC midnight, the way registration stores a date of birth.
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function ageOf(dob: Date): number {
  const now = new Date();
  let a = now.getFullYear() - dob.getFullYear();
  if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) a--;
  return a;
}

// ------------------------------------------------------------------ data ---

// ACMA numbers reserved for use in fiction — never assigned to a real phone.
const FICTIONAL_MOBILES = [
  '0491570006', '0491570156', '0491570157', '0491570158', '0491570159', '0491570110',
  '0491570313', '0491570737', '0491571266', '0491571491', '0491571804', '0491572549',
  '0491572665', '0491572983', '0491573770', '0491573087', '0491574118', '0491574632',
  '0491575254', '0491575789', '0491576398', '0491576801', '0491577426', '0491577644',
  '0491578957', '0491578148', '0491578888', '0491579212', '0491579760', '0491579455',
];

const DEMO_VENUES = [
  { name: 'Soultrap Bar', city: 'Sydney', address: '88 Campbell St, Surry Hills', phone: '(02) 9211 0222', websiteUrl: 'soultrap.com.au' },
  { name: 'Sheaf Hotel', city: 'Sydney', address: '429 New South Head Rd, Double Bay', phone: '(02) 9327 5877', websiteUrl: 'thesheaf.com.au' },
  { name: 'GG Bar', city: 'Sydney', address: 'Westfield Mall, Bondi Junction', phone: '0414 897 678', websiteUrl: 'ggbar.com.au' },
  { name: 'Chung Lo Bar', city: 'Sydney', address: '45 Jones St, Ultimo', phone: '(02) 9565 1287', websiteUrl: 'chunglo.com.au' },
  { name: 'City Tattersalls Club', city: 'Sydney', address: '194 Pitt St, Sydney', phone: '(02) 9267 9421', websiteUrl: 'citytatts.com.au' },
  { name: '25th Floor Cocktail Bar', city: 'Sydney', address: '25/1 Bligh St, Sydney', phone: null, websiteUrl: null },
  { name: 'Riverland Bar', city: 'Melbourne', address: 'Vaults 1-9, Federation Wharf, Melbourne', phone: '(03) 9662 1771', websiteUrl: 'riverlandbar.com' },
  { name: 'Bar Pacino', city: 'Brisbane', address: '1 Eagle St, Brisbane City', phone: null, websiteUrl: 'barpacino.com.au' },
] as const;

// Image and description for some venues (the rest are left blank on purpose,
// so the event and blast forms show both cases). No logos: there are no
// real venue logos to use locally.
const VENUE_EXTRAS: Record<string, { imageUrl: string; description: string }> = {
  'City Tattersalls Club': {
    imageUrl: '/photos/p7_formal_event.jpg',
    description: 'A grand old members’ club in the heart of the city — high ceilings, a long bar and plenty of quiet corners for a proper conversation.',
  },
  'Soultrap Bar': {
    imageUrl: '/photos/p2_couple_table.jpg',
    description: 'A relaxed Surry Hills cocktail bar with soft lighting and booth seating, two minutes’ walk from Central Station.',
  },
  'GG Bar': {
    imageUrl: '/photos/p4_pink_shirt.jpg',
    description: 'Bright and lively, with a great drinks list. Upstairs at Westfield Bondi Junction — take the lift to level 5.',
  },
};

type DemoMember = {
  name: string; gender: Gender; age: number; city: string;
  verified?: 'both' | 'email' | 'mobile' | 'none';
  terms?: boolean; contact?: ContactMethod; marketing?: boolean;
};

// Verification and consent vary on purpose, so the admin screens show every
// state: most people are fully set up, a few are half-verified, one or two
// never accepted the T&Cs (like imported members).
const DEMO_MEMBERS: DemoMember[] = [
  { name: 'Olivia Bennett', gender: 'FEMALE', age: 29, city: 'Sydney' },
  { name: 'Charlotte Nguyen', gender: 'FEMALE', age: 33, city: 'Sydney' },
  { name: 'Amelia Rossi', gender: 'FEMALE', age: 36, city: 'Sydney' },
  { name: 'Isla Patel', gender: 'FEMALE', age: 31, city: 'Sydney', verified: 'email' },
  { name: 'Mia Thompson', gender: 'FEMALE', age: 41, city: 'Sydney' },
  { name: 'Grace Walker', gender: 'FEMALE', age: 45, city: 'Sydney', contact: 'EMAIL' },
  { name: 'Sophie Chen', gender: 'FEMALE', age: 27, city: 'Sydney' },
  { name: 'Emily Kowalski', gender: 'FEMALE', age: 38, city: 'Sydney', marketing: false },
  { name: 'Hannah Murphy', gender: 'FEMALE', age: 47, city: 'Sydney' },
  { name: 'Zoe Papadopoulos', gender: 'FEMALE', age: 34, city: 'Sydney', verified: 'none', terms: false },
  { name: 'Lucy Fraser', gender: 'FEMALE', age: 52, city: 'Sydney' },
  { name: 'Ruby Kim', gender: 'FEMALE', age: 30, city: 'Sydney', contact: 'SMS' },
  { name: 'Chloe Anderson', gender: 'FEMALE', age: 39, city: 'Sydney' },
  { name: 'Ella Sharma', gender: 'FEMALE', age: 26, city: 'Sydney' },
  { name: 'Margaret Doyle', gender: 'FEMALE', age: 62, city: 'Sydney' },
  { name: 'Susan Hartley', gender: 'FEMALE', age: 58, city: 'Sydney', contact: 'DO_NOT_CONTACT' },
  { name: 'Jenny Lau', gender: 'FEMALE', age: 35, city: 'Sydney' },
  { name: 'Ava Morrison', gender: 'FEMALE', age: 43, city: 'Melbourne' },
  { name: 'Georgia Evans', gender: 'FEMALE', age: 32, city: 'Brisbane' },

  { name: 'James Wilson', gender: 'MALE', age: 32, city: 'Sydney' },
  { name: 'Liam OConnor', gender: 'MALE', age: 35, city: 'Sydney' },
  { name: 'Noah Tran', gender: 'MALE', age: 29, city: 'Sydney' },
  { name: 'William Harris', gender: 'MALE', age: 44, city: 'Sydney' },
  { name: 'Lucas Martin', gender: 'MALE', age: 38, city: 'Sydney', verified: 'mobile' },
  { name: 'Henry Clarke', gender: 'MALE', age: 47, city: 'Sydney' },
  { name: 'Oliver Singh', gender: 'MALE', age: 31, city: 'Sydney' },
  { name: 'Jack Robinson', gender: 'MALE', age: 40, city: 'Sydney', contact: 'EMAIL' },
  { name: 'Thomas Wright', gender: 'MALE', age: 36, city: 'Sydney' },
  { name: 'Daniel Park', gender: 'MALE', age: 28, city: 'Sydney' },
  { name: 'Matthew Kelly', gender: 'MALE', age: 50, city: 'Sydney', marketing: false },
  { name: 'Samuel Ahmed', gender: 'MALE', age: 33, city: 'Sydney', verified: 'none', terms: false },
  { name: 'Benjamin Hughes', gender: 'MALE', age: 42, city: 'Sydney' },
  { name: 'Ethan Lee', gender: 'MALE', age: 27, city: 'Sydney' },
  { name: 'Michael Russo', gender: 'MALE', age: 46, city: 'Sydney' },
  { name: 'David Brennan', gender: 'MALE', age: 61, city: 'Sydney' },
  { name: 'Peter Collins', gender: 'MALE', age: 66, city: 'Sydney' },
  { name: 'Andrew Walsh', gender: 'MALE', age: 37, city: 'Sydney', contact: 'SMS' },
  { name: 'Ryan Mitchell', gender: 'MALE', age: 34, city: 'Melbourne' },
  { name: 'Nathan Cooper', gender: 'MALE', age: 39, city: 'Brisbane' },
];

function emailFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.') + EMAIL_DOMAIN;
}

// --------------------------------------------------------------- removal ---

async function removeDemoData() {
  const demoMembers = await prisma.member.findMany({ where: { email: { endsWith: EMAIL_DOMAIN } }, select: { id: true } });
  const memberIds = demoMembers.map((m) => m.id);

  const cities = await prisma.city.findMany();
  const cityId = (n: string) => cities.find((c) => c.name === n)?.id;
  const venues = await prisma.venue.findMany({
    where: { OR: DEMO_VENUES.map((v) => ({ name: v.name, cityId: cityId(v.city) ?? '__none__' })) },
    select: { id: true },
  });
  const venueIds = venues.map((v) => v.id);

  const events = await prisma.event.findMany({ where: { venueId: { in: venueIds } }, select: { id: true, seriesId: true } });
  const eventIds = events.map((e) => e.id);
  const seriesIds = [...new Set(events.map((e) => e.seriesId).filter((s): s is string => !!s))];

  await prisma.rating.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { raterId: { in: memberIds } }, { ratedMemberId: { in: memberIds } }] } });
  await prisma.match.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { memberAId: { in: memberIds } }, { memberBId: { in: memberIds } }] } });
  await prisma.booking.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { memberId: { in: memberIds } }] } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  // A series only goes if nothing outside the demo data still belongs to it.
  for (const id of seriesIds) {
    if ((await prisma.event.count({ where: { seriesId: id } })) === 0) await prisma.eventSeries.delete({ where: { id } });
  }

  const campaigns = await prisma.campaign.findMany({ where: { title: { startsWith: '[Demo]' } }, select: { id: true } });
  await prisma.campaignSend.deleteMany({ where: { campaignId: { in: campaigns.map((c) => c.id) } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaigns.map((c) => c.id) } } });
  await prisma.campaignTemplate.deleteMany({ where: { title: { startsWith: '[Demo]' } } });

  const codes = await prisma.discountCode.findMany({ where: { code: { startsWith: 'DEMO' } }, select: { id: true } });
  await prisma.booking.updateMany({ where: { discountCodeId: { in: codes.map((c) => c.id) } }, data: { discountCodeId: null } });
  await prisma.discountCode.deleteMany({ where: { id: { in: codes.map((c) => c.id) } } });

  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
  // Only venues nothing else still uses.
  for (const id of venueIds) {
    if ((await prisma.event.count({ where: { venueId: id } })) === 0) await prisma.venue.delete({ where: { id } });
  }

  console.log(`Removed demo data: ${memberIds.length} members, ${eventIds.length} events, ${campaigns.length} blasts, ${codes.length} discount codes.`);
}

// ------------------------------------------------------------- insertion ---

async function insertDemoData() {
  const cities = await prisma.city.findMany();
  const themes = await prisma.eventTheme.findMany();
  if (!cities.length || !themes.length) throw new Error('Run `npm run db:seed` first — cities and themes are missing.');
  const city = (n: string) => cities.find((c) => c.name === n)!.id;
  const theme = (n: string) => {
    const t = themes.find((x) => x.name === n);
    if (!t) throw new Error(`Theme "${n}" not found — run npm run db:seed.`);
    return t.id;
  };

  // Venues
  const venue: Record<string, string> = {};
  for (const v of DEMO_VENUES) {
    const row = await prisma.venue.create({
      data: { name: v.name, cityId: city(v.city), address: v.address, phone: v.phone, websiteUrl: v.websiteUrl, ...VENUE_EXTRAS[v.name] },
    });
    venue[v.name] = row.id;
  }

  // Members
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const members: { id: string; gender: Gender; age: number; city: string }[] = [];
  for (const [i, m] of DEMO_MEMBERS.entries()) {
    const verified = m.verified ?? 'both';
    const terms = m.terms ?? true;
    const row = await prisma.member.create({
      data: {
        name: m.name, gender: m.gender, email: emailFor(m.name), passwordHash,
        dateOfBirth: yearsAgo(m.age, 20 + i * 7), // spread birthdays through the year
        mobile: FICTIONAL_MOBILES[i % FICTIONAL_MOBILES.length],
        cityId: city(m.city),
        emailVerified: verified === 'both' || verified === 'email',
        mobileVerified: verified === 'both' || verified === 'mobile',
        agreedTerms: terms, agreedTermsAt: terms ? new Date() : null,
        contactMethod: m.contact ?? 'EMAIL_AND_SMS',
        marketingOptIn: m.marketing ?? true,
        // Stagger sign-up dates so the members list isn't all "today".
        createdAt: new Date(Date.now() - (DEMO_MEMBERS.length - i) * 5 * DAY),
      },
    });
    members.push({ id: row.id, gender: m.gender, age: ageOf(row.dateOfBirth), city: m.city });
  }

  const PHOTOS = ['/photos/p2_couple_table.jpg', '/photos/p7_formal_event.jpg', '/photos/p1_white_dress.jpg', '/photos/p4_pink_shirt.jpg'];
  const BLURB = (who: string) =>
    `${who}, here's your chance to meet a whole bunch of great singles in your age group and actually talk to up to 10 of them in one night.\n\n` +
    `No awkward mingling, no name-tag games — just relaxed, short one-on-one chats with a drink in hand.\n\n` +
    `We were the pioneers of speed dating back in 1999. Reserve your spot now!`;

  type E = {
    days: number; hh: number; mm?: number; name: string; theme: string; venue: string; city?: string;
    ageMin: number; ageMax: number; cost: number; expenses?: number; max?: number;
    confirmed?: boolean; hidden?: boolean; photo?: number; blurb?: string;
    men: number; women: number; seriesId?: string; checkedIn?: boolean;
    noCodes?: boolean; noFriends?: boolean; draft?: boolean;
  };

  const series = await prisma.eventSeries.create({ data: { frequency: 'MONTHLY', interval: 1 } });

  // One row per colour group on /admin/events, plus enough to need a second
  // page. "Next week" means the next seven days, counting from right now.
  const EVENTS: E[] = [
    // Past — white
    { days: -21, hh: 19, mm: 30, name: '35-50 years', theme: 'Professionals speed dating', venue: 'Sheaf Hotel', ageMin: 35, ageMax: 50, cost: 49, expenses: 180, confirmed: true, men: 8, women: 9, checkedIn: true },
    { days: -9, hh: 19, name: '28-40 years', theme: 'Blondes and Redheads speed dating', venue: 'Soultrap Bar', ageMin: 28, ageMax: 40, cost: 49, expenses: 150, confirmed: true, men: 7, women: 7, checkedIn: true },
    { days: -2, hh: 19, name: '25-39 years', theme: 'Asian speed dating', venue: 'Chung Lo Bar', ageMin: 25, ageMax: 39, cost: 45, expenses: 120, confirmed: true, men: 6, women: 5, checkedIn: true },

    // Next 7 days, NOT confirmed — orange
    { days: 1, hh: 19, mm: 30, name: '30-45 years', theme: 'Speed dating', venue: 'GG Bar', ageMin: 30, ageMax: 45, cost: 49, men: 3, women: 4 },
    { days: 4, hh: 14, name: '55 to 70 years', theme: 'Seniors speed dating', venue: 'Soultrap Bar', ageMin: 55, ageMax: 70, cost: 49, men: 2, women: 3, photo: 3, blurb: BLURB('OK seniors') },

    // Next 7 days, confirmed — yellow
    { days: 2, hh: 19, mm: 30, name: '35-49 years', theme: 'Professionals speed dating', venue: 'City Tattersalls Club', ageMin: 35, ageMax: 49, cost: 49, max: 10, confirmed: true, men: 9, women: 8, photo: 1, blurb: BLURB('Busy professionals') },
    // Men are FULL here (8/8) — try adding another man to see the capacity message.
    { days: 5, hh: 19, name: '27-39 years', theme: 'Asian speed dating', venue: 'Chung Lo Bar', ageMin: 27, ageMax: 39, cost: 45, max: 8, confirmed: true, men: 8, women: 6 },

    // Further ahead — green
    { days: 9, hh: 19, mm: 30, name: '40 to 55 years', theme: 'Speed dating', venue: '25th Floor Cocktail Bar', ageMin: 40, ageMax: 55, cost: 55, men: 2, women: 3, photo: 0, blurb: BLURB('Hi there') },
    { days: 12, hh: 19, name: '28-40 years', theme: 'Blondes and Redheads speed dating', venue: 'Soultrap Bar', ageMin: 28, ageMax: 40, cost: 49, men: 1, women: 2, seriesId: series.id },
    { days: 42, hh: 19, name: '28-40 years', theme: 'Blondes and Redheads speed dating', venue: 'Soultrap Bar', ageMin: 28, ageMax: 40, cost: 49, men: 0, women: 0, seriesId: series.id },
    { days: 72, hh: 19, name: '28-40 years', theme: 'Blondes and Redheads speed dating', venue: 'Soultrap Bar', ageMin: 28, ageMax: 40, cost: 49, men: 0, women: 0, seriesId: series.id },
    { days: 16, hh: 14, mm: 15, name: '25 to 39 years', theme: 'Fit and fabulous speed dating', venue: 'GG Bar', ageMin: 25, ageMax: 39, cost: 49, hidden: true, men: 0, women: 1 },
    // "FastMatch Discounts" off — no discount code box on this one.
    { days: 23, hh: 19, mm: 30, name: '35-50 years', theme: 'Professionals speed dating', venue: 'Sheaf Hotel', ageMin: 35, ageMax: 50, cost: 49, men: 0, women: 0, photo: 2, blurb: BLURB('Hello'), noCodes: true },
    { days: 30, hh: 19, name: '30-45 years', theme: 'Speed dating', venue: 'Riverland Bar', city: 'Melbourne', ageMin: 30, ageMax: 45, cost: 49, men: 1, women: 1 },
    { days: 37, hh: 19, name: '28-40 years', theme: 'Wine Lovers speed dating', venue: 'Bar Pacino', city: 'Brisbane', ageMin: 28, ageMax: 40, cost: 59, men: 1, women: 1 },
    // "Group Discounts" off — no bring-a-friend option on this one.
    { days: 50, hh: 18, mm: 30, name: '35-50 years', theme: 'Single parents speed dating', venue: 'Sheaf Hotel', ageMin: 35, ageMax: 50, cost: 49, men: 0, women: 0, noFriends: true },
    // A draft, as "Duplicate event" leaves it: in the admin list, not on the site.
    { days: 44, hh: 19, name: '30-45 years', theme: 'Speed dating', venue: 'GG Bar', ageMin: 30, ageMax: 45, cost: 49, men: 0, women: 0, draft: true },
  ];

  // Payment methods cycle so every one shows up on the bookings screens;
  // null = booked and paid online through Stripe.
  const METHODS: (PaymentMethod | null)[] = [null, null, 'CASH', null, 'PAY_AT_DOOR', null, 'CARD', 'FRIEND_BOOKED_IN'];

  let eventCount = 0;
  const pastEvents: { days: number; id: string }[] = [];
  let bookingCount = 0;
  for (const e of EVENTS) {
    const cityName = e.city ?? 'Sydney';
    const event = await prisma.event.create({
      data: {
        name: e.name, themeId: theme(e.theme), cityId: city(cityName), venueId: venue[e.venue],
        startsAt: sydneyAt(e.days, e.hh, e.mm ?? 0),
        ageMin: e.ageMin, ageMax: e.ageMax, cost: e.cost, expenses: e.expenses ?? null,
        maxMen: e.max ?? 12, maxWomen: e.max ?? 12,
        visibility: e.hidden ? 'NOT_PUBLIC' : 'PUBLIC',
        confirmed: e.confirmed ?? false,
        photoUrl: e.photo != null ? PHOTOS[e.photo] : null,
        description: e.blurb ?? null,
        seriesId: e.seriesId ?? null,
        fastmatchDiscounts: !e.noCodes,
        groupDiscounts: !e.noFriends,
        draft: !!e.draft,
      },
    });
    eventCount++;
    if (e.days < 0) pastEvents.push({ days: e.days, id: event.id });

    // Members from the event's city whose age suits it — fewer than asked
    // for if there aren't enough, rather than a 29-year-old at seniors night.
    const pick = (g: Gender, n: number) =>
      members.filter((m) => m.gender === g && m.city === cityName && m.age >= e.ageMin && m.age <= e.ageMax).slice(0, n);
    const attendees = [...pick('MALE', e.men), ...pick('FEMALE', e.women)];

    for (const [i, m] of attendees.entries()) {
      const method = METHODS[(i + eventCount) % METHODS.length];
      // One abandoned online checkout on the first upcoming event, so the
      // PENDING state appears somewhere — with a friend waiting on the
      // payment, as the bring-a-friend flow leaves it. It holds no places.
      const status: BookingStatus = e.days === 1 && i === 0 ? 'PENDING' : 'CONFIRMED';
      await prisma.booking.create({
        data: {
          eventId: event.id, memberId: m.id, badge: i + 1, status,
          paidAmount: method === 'FRIEND_BOOKED_IN' ? 0 : e.cost,
          paymentMethod: status === 'PENDING' ? null : method,
          pendingFriends: status === 'PENDING'
            ? [{ gender: 'MALE', name: 'Tom Reid', email: 'tom.reid@example.com', mobile: '0491578888', dateOfBirth: '1990-04-12', paidAmount: e.cost - 10 }]
            : undefined,
          checkedIn: !!e.checkedIn, checkedInAt: e.checkedIn ? event.startsAt : null,
          reminderSent: e.days < 0,
          createdAt: new Date(event.startsAt.getTime() - (10 + i) * DAY),
        },
      });
      bookingCount++;
    }
  }

  // My Match History: results are in for the two older past events (with a
  // few mutual matches), not yet for the most recent one — so the page shows
  // both "Information not available yet" and real matches.
  let matchCount = 0;
  for (const past of pastEvents) {
    if (past.days > -3) continue;
    await prisma.event.update({ where: { id: past.id }, data: { matchesCalculated: true, matchesCalculatedAt: new Date() } });
    const attendees = await prisma.booking.findMany({ where: { eventId: past.id, status: 'CONFIRMED' }, include: { member: true }, orderBy: { badge: 'asc' } });
    const men = attendees.filter((b) => b.member.gender === 'MALE');
    const women = attendees.filter((b) => b.member.gender === 'FEMALE');
    const pairs: [number, number, 'DATE' | 'FRIEND'][] = [[0, 0, 'DATE'], [0, 1, 'FRIEND'], [1, 0, 'FRIEND'], [2, 1, 'DATE']];
    for (const [w, m, result] of pairs) {
      if (!women[w] || !men[m]) continue;
      await prisma.match.create({ data: { eventId: past.id, memberAId: women[w].memberId, memberBId: men[m].memberId, result, emailSent: true } });
      matchCount++;
    }
  }

  // Blasts
  const sydney = city('Sydney');
  const template = await prisma.campaignTemplate.create({
    data: {
      title: '[Demo] Standard event blast',
      subject: 'Speed dating this week — spots still available',
      heading: 'SPEED DATING\nThis week in Sydney',
      freeText: "Meet up to 10 great singles in one relaxed night. Book now before it's full!",
      smsBody: 'FastMatch speed dating this week in Sydney. Book at fastmatch.com.au',
    },
  });
  const campaignA = await prisma.campaign.create({
    data: {
      title: '[Demo] Professionals 35-49 — this week', templateId: template.id,
      sendEmail: true, sendSms: true,
      subject: 'Professionals speed dating — 35 to 49 years',
      heading: 'PROFESSIONALS SPEED DATING\n35-49 years at City Tattersalls Club',
      freeText: 'Busy professionals, this one is for you. A few spots left for women.',
      eventDetailsText: 'City Tattersalls Club\n194 Pitt St, Sydney\n(02) 9267 9421\ncitytatts.com.au',
      bookingLink: `${process.env.APP_URL ?? 'http://localhost:3000'}/events`,
      photoUrl: PHOTOS[1],
      smsBody: 'Professionals speed dating 35-49 this week at City Tattersalls. Book at fastmatch.com.au',
      filter: { cityId: sydney, gender: 'FEMALE', ageMin: 33, ageMax: 51, marketingOptInOnly: true },
    },
  });
  await prisma.campaignSend.create({
    data: {
      campaignId: campaignA.id, status: 'SENT', totalRecipients: 9, sentCount: 9,
      filterSnapshot: campaignA.filter as object, startedAt: new Date(Date.now() - 3 * DAY), completedAt: new Date(Date.now() - 3 * DAY + 60_000),
    },
  });
  await prisma.campaign.create({
    data: {
      title: '[Demo] Seniors night — spots left', sendEmail: true,
      subject: 'Seniors speed dating this week',
      heading: 'SENIORS SPEED DATING\n55 to 70 years at Soultrap Bar',
      freeText: "OK seniors, here's your chance to meet a whole bunch of great singles in your age group.",
      eventDetailsText: 'Soultrap Bar\n88 Campbell St, Surry Hills\n(02) 9211 0222',
      photoUrl: PHOTOS[3],
      filter: { cityId: sydney, ageMin: 53, ageMax: 72, marketingOptInOnly: true },
    },
  });
  const campaignC = await prisma.campaign.create({
    data: {
      title: '[Demo] SMS only — Asian speed dating', sendEmail: false, sendSms: true,
      smsBody: 'Asian speed dating this Friday at Chung Lo Bar, Ultimo. Book at fastmatch.com.au',
      filter: { cityId: sydney, ageMin: 25, ageMax: 41, marketingOptInOnly: true, contactMethods: ['EMAIL_AND_SMS', 'SMS'] },
    },
  });
  await prisma.campaignSend.create({
    data: {
      campaignId: campaignC.id, status: 'SENT', totalRecipients: 14, sentCount: 14,
      filterSnapshot: campaignC.filter as object, startedAt: new Date(Date.now() - 6 * DAY), completedAt: new Date(Date.now() - 6 * DAY + 30_000),
    },
  });

  // Discount codes
  await prisma.discountCode.createMany({
    data: [
      { code: 'DEMO10', type: 'PERCENT_OFF', amount: 10, validFrom: new Date(Date.now() - 30 * DAY), validTo: new Date(Date.now() + 90 * DAY) },
      { code: 'DEMO15OFF', type: 'FIXED_REDUCTION', amount: 15, validFrom: new Date(Date.now() - 30 * DAY), validTo: new Date(Date.now() + 90 * DAY) },
      { code: 'DEMOFREE', type: 'FREE', validFrom: new Date(Date.now() - 30 * DAY), validTo: new Date(Date.now() + 90 * DAY) },
      { code: 'DEMOEXPIRED', type: 'PERCENT_OFF', amount: 20, validFrom: new Date(Date.now() - 90 * DAY), validTo: new Date(Date.now() - 1 * DAY) },
    ],
  });

  // Olivia has already used DEMO10, so entering it on a new booking shows
  // "DEMO10 promotion already used" and gives no discount.
  const demo10 = await prisma.discountCode.findUniqueOrThrow({ where: { code: 'DEMO10' } });
  const olivia = await prisma.member.findUniqueOrThrow({ where: { email: emailFor('Olivia Bennett') } });
  const pastAsian = await prisma.event.findFirstOrThrow({ where: { name: '25-39 years', venueId: venue['Chung Lo Bar'] } });
  const hers = await prisma.booking.findUnique({ where: { eventId_memberId: { eventId: pastAsian.id, memberId: olivia.id } } });
  if (hers) {
    await prisma.booking.update({ where: { id: hers.id }, data: { discountCodeId: demo10.id, status: 'CONFIRMED', paymentMethod: null } });
  } else {
    const top = await prisma.booking.aggregate({ where: { eventId: pastAsian.id }, _max: { badge: true } });
    await prisma.booking.create({
      data: { eventId: pastAsian.id, memberId: olivia.id, badge: (top._max.badge ?? 0) + 1, status: 'CONFIRMED', paidAmount: 40.5, discountCodeId: demo10.id, checkedIn: true, checkedInAt: pastAsian.startsAt },
    });
  }
  await prisma.discountCode.update({ where: { id: demo10.id }, data: { usedCount: 1 } });

  // One member who brought (and paid for) a friend, as the bring-a-friend
  // flow records it — shows as "Friend of …" on that event's bookings.
  const fortyFive = await prisma.event.findFirstOrThrow({ where: { name: '40 to 55 years', venueId: venue['25th Floor Cocktail Bar'] } });
  const [payer, friend] = await prisma.booking.findMany({ where: { eventId: fortyFive.id }, orderBy: { badge: 'asc' }, take: 2 });
  if (payer && friend) {
    await prisma.booking.update({ where: { id: payer.id }, data: { paymentMethod: null, paidAmount: fortyFive.cost } });
    await prisma.booking.update({ where: { id: friend.id }, data: { bookedById: payer.id, paymentMethod: null, paidAmount: Number(fortyFive.cost) - 10 } });
  }

  // Member Feedback: a few messages, one about an event and some general.
  const pastSoultrap = await prisma.event.findFirstOrThrow({ where: { name: '28-40 years', venueId: venue['Soultrap Bar'], startsAt: { lt: new Date() } } });
  const fb = (email: string) => prisma.member.findUniqueOrThrow({ where: { email: emailFor(email) } });
  await prisma.feedback.createMany({
    data: [
      { memberId: (await fb('Olivia Bennett')).id, eventId: pastSoultrap.id, message: 'Loved it! The host was great and kept everything moving.\nCould the bar music be a little quieter next time?', createdAt: new Date(Date.now() - 8 * DAY) },
      { memberId: (await fb('James Wilson')).id, eventId: pastSoultrap.id, message: 'Really well organised. Would love more events on Friday nights.', createdAt: new Date(Date.now() - 7 * DAY) },
      { memberId: (await fb('Hannah Murphy')).id, message: 'Any chance of events on the North Shore?', createdAt: new Date(Date.now() - 2 * DAY) },
    ],
  });

  // The old site's welcome offer on My Match History ("$10.00 OFF your first
  // event with FMDC10"). A real code name, so only created if it's missing —
  // and never removed by --remove.
  const fmdc10 = await prisma.discountCode.findUnique({ where: { code: 'FMDC10' } });
  if (!fmdc10) {
    await prisma.discountCode.create({
      data: { code: 'FMDC10', type: 'FIXED_REDUCTION', amount: 10, validFrom: new Date(Date.now() - 30 * DAY), validTo: new Date(Date.now() + 365 * DAY) },
    });
  }
  console.log(`Matches: ${matchCount} across the two older past events. FMDC10 ${fmdc10 ? 'already existed' : 'created'}.`);

  console.log(`Inserted demo data: ${members.length} members, ${DEMO_VENUES.length} venues, ${eventCount} events, ${bookingCount} bookings, 3 blasts, 1 blast template, 4 discount codes.`);
  console.log(`Demo members log in with their email (e.g. ${emailFor(DEMO_MEMBERS[0].name)}) and password: ${DEMO_PASSWORD}`);
}

async function main() {
  assertLocalDatabase();
  await removeDemoData();
  if (!process.argv.includes('--remove')) await insertDemoData();
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
