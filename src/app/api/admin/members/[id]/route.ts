import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/members/:id — "click a member to view their details" on
// the real Members screen. Includes their booking and match history.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const member = await prisma.member.findUniqueOrThrow({
    where: { id: params.id },
    include: {
      city: true,
      bookings: { include: { event: true }, orderBy: { createdAt: 'desc' } },
    },
  });

  const matches = await prisma.match.findMany({
    where: { OR: [{ memberAId: params.id }, { memberBId: params.id }] },
  });

  // Never return the password hash or the pending SMS verification code to the admin UI
  const { passwordHash, mobileVerificationCode, ...safeMember } = member;

  return NextResponse.json({ ...safeMember, matches });
});

const patchSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().min(1),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: z.string(), // ISO date
  cityId: z.string(),
});

// PATCH /api/admin/members/:id — admin editing a member's details, e.g.
// fixing a typo'd email or a walk-in entered at the door with wrong details.
//
// Deliberately does NOT reset emailVerified/mobileVerified the way the
// member's own /api/account/profile route does. There, a self-service email
// change needs re-verification or someone could swap in an address they
// don't own while staying "verified". Here an admin is correcting data on
// someone's behalf, and silently un-verifying them would block them from
// booking with no explanation.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please check the details.' }, { status: 400 });
  const data = parsed.data;

  const dob = new Date(data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return NextResponse.json({ error: 'Please enter a valid date of birth.' }, { status: 400 });
  }

  // email is @unique — check first so this surfaces as a clear 409 rather
  // than a raw Prisma constraint violation.
  const clash = await prisma.member.findUnique({ where: { email: data.email } });
  if (clash && clash.id !== params.id) {
    return NextResponse.json({ error: 'That email is already in use by another member.' }, { status: 409 });
  }

  const city = await prisma.city.findUnique({ where: { id: data.cityId } });
  if (!city) return NextResponse.json({ error: 'Please select a valid city.' }, { status: 400 });

  const updated = await prisma.member.update({
    where: { id: params.id },
    data: { name: data.name, email: data.email, mobile: data.mobile, gender: data.gender, dateOfBirth: dob, cityId: data.cityId },
  });

  const { passwordHash, mobileVerificationCode, ...safe } = updated;
  return NextResponse.json(safe);
});

// DELETE /api/admin/members/:id — permanently removes a member.
//
// None of Member's foreign keys cascade (Booking.memberId, Rating.raterId /
// ratedMemberId, Match.memberAId / memberBId are all RESTRICT), so the child
// rows have to go first or the delete fails outright. All of it runs in one
// transaction so a partial failure can't strand orphaned rows.
//
// This is destructive and irreversible: deleting a member who has attended
// paid events also removes those Booking rows, which revenue reports are
// computed from. The UI states exactly what will be removed before asking
// for confirmation.
export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const member = await prisma.member.findUniqueOrThrow({ where: { id: params.id } });

  // Guard against an admin deleting their own login, or another admin's —
  // there is no UI to recreate one, so this would lock people out for good.
  if (member.isAdmin) {
    return NextResponse.json({ error: 'Admin accounts cannot be deleted from here.' }, { status: 403 });
  }

  // The member delete belongs INSIDE the transaction with the children — if
  // it were a separate call and failed, the history would already be gone.
  const [bookings, ratings, matches] = await prisma.$transaction([
    prisma.booking.deleteMany({ where: { memberId: member.id } }),
    prisma.rating.deleteMany({ where: { OR: [{ raterId: member.id }, { ratedMemberId: member.id }] } }),
    prisma.match.deleteMany({ where: { OR: [{ memberAId: member.id }, { memberBId: member.id }] } }),
    prisma.member.delete({ where: { id: member.id } }),
  ]);

  return NextResponse.json({
    ok: true,
    deleted: { bookings: bookings.count, ratings: ratings.count, matches: matches.count },
  });
});
