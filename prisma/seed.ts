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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
