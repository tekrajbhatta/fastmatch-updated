/**
 * Hard-delete member accounts by email, so an address can be registered
 * again from scratch.
 *
 * Written for clearing out test registrations, e.g. the accounts stranded by
 * the Cellcast sender-ID bug — created, but with no session and no way to
 * verify, so every retry 409s on "email already exists".
 *
 * Nothing in the app deletes members (unsubscribe only flips flags), and
 * none of Member's foreign keys cascade — Booking.memberId, Rating.raterId /
 * ratedMemberId and Match.memberAId / memberBId are all RESTRICT. So a plain
 * `DELETE FROM Member` fails the moment an account has any history. This
 * removes the child rows first, in one transaction.
 *
 * Usage:
 *   # 1. Preview — always run this first. Changes nothing.
 *   npm run delete-members -- a@example.com b@example.com
 *
 *   # 2. Actually delete
 *   npm run delete-members -- a@example.com b@example.com --confirm
 *
 * Refuses to touch admin accounts. Emails are matched case-insensitively,
 * which is how registration compares them.
 */

import { prisma } from '../lib/prisma';

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const emails = args.filter((a) => !a.startsWith('--'));

  if (emails.length === 0) {
    console.error('Usage: npm run delete-members -- <email> [<email>...] [--confirm]');
    process.exit(1);
  }

  console.log(`${confirm ? 'DELETING' : 'PREVIEW (nothing will change)'} — ${emails.length} email(s)\n`);

  let deleted = 0;
  let skipped = 0;

  for (const email of emails) {
    // Case-insensitive by virtue of MySQL's default collation
    // (utf8mb4_..._ci), so "A@x.com" finds the row stored as "a@x.com" —
    // which is what someone re-registering would expect. Prisma's
    // `mode: 'insensitive'` is Postgres-only and not available here.
    const member = await prisma.member.findFirst({ where: { email } });

    if (!member) {
      console.log(`  ${email} — not found, nothing to do`);
      skipped++;
      continue;
    }

    if (member.isAdmin) {
      console.log(`  ${email} — SKIPPED: this is an admin account`);
      skipped++;
      continue;
    }

    const [bookings, ratingsGiven, ratingsReceived, matchesA, matchesB] = await Promise.all([
      prisma.booking.count({ where: { memberId: member.id } }),
      prisma.rating.count({ where: { raterId: member.id } }),
      prisma.rating.count({ where: { ratedMemberId: member.id } }),
      prisma.match.count({ where: { memberAId: member.id } }),
      prisma.match.count({ where: { memberBId: member.id } }),
    ]);
    const history = bookings + ratingsGiven + ratingsReceived + matchesA + matchesB;

    console.log(
      `  ${email} — ${member.name} (id ${member.id}, created ${member.createdAt.toISOString().slice(0, 10)})\n` +
        `      verified: email=${member.emailVerified} mobile=${member.mobileVerified}\n` +
        `      history: ${bookings} booking(s), ${ratingsGiven + ratingsReceived} rating(s), ${matchesA + matchesB} match(es)`
    );

    if (history > 0 && !confirm) {
      console.log('      NOTE: this account has real history — deleting removes it permanently.');
    }

    if (!confirm) continue;

    // Children first (all FKs are RESTRICT), then the member — one
    // transaction so a failure part-way can't leave orphaned rows.
    await prisma.$transaction([
      prisma.rating.deleteMany({
        where: { OR: [{ raterId: member.id }, { ratedMemberId: member.id }] },
      }),
      prisma.match.deleteMany({
        where: { OR: [{ memberAId: member.id }, { memberBId: member.id }] },
      }),
      prisma.booking.deleteMany({ where: { memberId: member.id } }),
      prisma.member.delete({ where: { id: member.id } }),
    ]);

    console.log('      deleted.');
    deleted++;
  }

  if (!confirm) {
    console.log('\nPreview only. Re-run with --confirm to delete.');
  } else {
    console.log(
      `\nDone — ${deleted} deleted, ${skipped} skipped.` +
        (deleted > 0 ? ' Those addresses can now register again.' : '')
    );
  }
}

main()
  .catch((err) => {
    console.error('delete-members failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
