/**
 * Seeds the two reference tables the app can't function without:
 * cities and event themes.
 *
 * Both lists are the "final confirmed" ones from fastmatch-com-au-spec.md
 * (sections 2.1b and 2.1a) — not invented here. The deployment guide
 * requires City to be seeded *before* any member import, because
 * importMembers.ts matches on city name and skips rows it can't match.
 *
 * Idempotent: name is @unique on both models, so upsert means re-running
 * this never duplicates rows. Safe to run against an existing database.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Spec 2.1b — final confirmed list.
const CITIES = [
  'Sydney',
  'Melbourne',
  'Brisbane',
  'Adelaide',
  'Perth',
  'Gold Coast',
  'Newcastle',
  'Central Coast',
  'Wollongong',
];

// Spec 2.1a — final confirmed list (23 themes). Admin can add more later.
const EVENT_THEMES = [
  'Speed dating',
  'Asian speed dating',
  'Academics speed dating',
  'Blondes and Redheads speed dating',
  'Cooking class & speed dating',
  'Christian speed dating',
  'Coffee making speed dating',
  'Dog Lovers speed dating',
  'European background speed dating',
  'Fit and fabulous speed dating',
  'Foodies speed dating',
  'Hunter Valley wine tour & speed dating',
  'Jewish speed dating',
  'Music Lovers speed dating',
  'Professionals speed dating',
  'A Day at the Races',
  'Seniors speed dating',
  'Single parents speed dating',
  'Sports Lovers speed dating',
  'Tantric speed dating',
  'Travel Lovers speed dating',
  'Tall people speed dating',
  'Wine Lovers speed dating',
];

async function main() {
  for (const name of CITIES) {
    await prisma.city.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Cities seeded: ${CITIES.length}`);

  for (const name of EVENT_THEMES) {
    await prisma.eventTheme.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Event themes seeded: ${EVENT_THEMES.length}`);

  await seedAdmin();
}

// Admin bootstrap. Admins are ordinary Members with isAdmin=true and there is
// no in-app way to create the first one, so without this the admin panel is
// unreachable on a fresh database.
//
// The email defaults to gil@fastmatch.com.au (Gil's confirmed choice, decision
// #4 of the deployment guide) but can be overridden with SEED_ADMIN_EMAIL.
//
// The PASSWORD is deliberately env-only with NO fallback: the client's version
// defaulted to a hard-coded "ChangeMe123!", which would ship a known admin
// password in the repository. Without SEED_ADMIN_PASSWORD set, the admin step
// is skipped entirely rather than creating a guessable account.
//
// If the member already exists it's promoted to admin and its password is
// left alone — so this never clobbers a real account's password on re-run.
const DEFAULT_ADMIN_EMAIL = 'gil@fastmatch.com.au';

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    console.log(`Admin bootstrap skipped for ${email} — set SEED_ADMIN_PASSWORD to enable.`);
    return;
  }

  const existing = await prisma.member.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isAdmin) {
      await prisma.member.update({ where: { id: existing.id }, data: { isAdmin: true } });
      console.log(`Admin bootstrap: promoted existing member ${email} to admin.`);
    } else {
      console.log(`Admin bootstrap: ${email} is already an admin.`);
    }
    return;
  }

  const sydney = await prisma.city.findUnique({ where: { name: 'Sydney' } });
  if (!sydney) throw new Error('Admin bootstrap needs the City seed to have run first.');

  await prisma.member.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 12),
      name: process.env.SEED_ADMIN_NAME ?? 'FastMatch Admin',
      gender: 'FEMALE', // required field; irrelevant for an admin account
      dateOfBirth: new Date('1980-01-01'),
      mobile: '0400000000',
      cityId: sydney.id,
      isAdmin: true,
      emailVerified: true,
      mobileVerified: true,
      agreedTerms: true,
      agreedTermsAt: new Date(),
      marketingOptIn: false,
    },
  });
  console.log(`Admin bootstrap: created admin account ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
