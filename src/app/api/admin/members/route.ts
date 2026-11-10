import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { buildMemberWhere, MemberFilter } from '@/lib/memberFilter';
import { memberFilterFromParams } from '@/lib/memberFilterParams';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { attendedBookingWhere } from '@/lib/attended';
import bcrypt from 'bcryptjs';
import { newMemberSchema, checkNewMember, newMemberData } from '@/lib/adminMember';
import { sendEmailVerification, sendMobileVerification } from '@/lib/memberVerification';
import { sendEmail } from '@/lib/emails/send';
import { registeredByAdminEmail, registeredLinks } from '@/lib/emails/signupEmails';
import { withMobileMatches } from '@/lib/memberSearch';
import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_TOO_LONG } from '@/lib/tokens';

const PAGE_SIZE = 50;

// Upper limits on what "Add member" accepts, checked alongside the shared
// rules (src/lib/adminMember.ts), which set only the lower ones.
const lengthLimits = z.object({
  name: z.string().max(100, 'Please enter a shorter name.').optional(),
  email: z.string().max(254, 'Please enter a valid email address.').optional(),
  mobile: z.string().max(30, 'Please enter an Australian mobile number, like 0412 345 678.').optional(),
  password: z.string().max(PASSWORD_MAX, PASSWORD_TOO_LONG.replace('Your password', 'The password')).optional(),
  dateOfBirth: z.string().max(30, 'Please enter a valid date of birth.').optional(),
  cityId: z.string().max(100, 'Please select a valid location.').optional(),
});
const addMemberSchema = z.intersection(newMemberSchema, lengthLimits);

// GET /api/admin/members?search=&gender=&cityId=&ageMin=&ageMax=&page=
// Paginated — real member counts run into the tens of thousands, so this
// can never return "everything" at once. Totals (matching count, gender
// split, total matches) are computed over the FULL filtered set via
// database-level aggregates, not just the current page — matches the
// mockup's requirement without loading thousands of rows to do it.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  // A whole page number from 1; anything else (junk, 1.5, 1e400) is page 1,
  // as on Member Feedback: "?page=abc" used to ask the database to skip NaN
  // rows, which failed as a server error.
  const asked = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(asked) && asked >= 1 && asked <= 1_000_000 ? asked : 1;
  // Same parsing as the members screen and its blast page — see memberFilterFromParams.
  const filter: MemberFilter = await withMobileMatches(memberFilterFromParams(params));
  const where = buildMemberWhere(filter);

  const [members, total, maleCount, femaleCount, totalMatches] = await Promise.all([
    prisma.member.findMany({
      where,
      select: {
        // dateOfBirth is needed for the Age column on the Members screen —
        // age is computed client-side rather than stored.
        id: true, name: true, email: true, mobile: true, gender: true, dateOfBirth: true, createdAt: true,
        city: { select: { name: true } },
        // "Events attended": paid, at events that have happened (src/lib/attended.ts).
        _count: { select: { bookings: { where: attendedBookingWhere() } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.member.count({ where }),
    prisma.member.count({ where: { ...where, gender: 'MALE' } }),
    prisma.member.count({ where: { ...where, gender: 'FEMALE' } }),
    // Matches where EITHER side is in the filtered set — a DB-level count,
    // not fetched rows, so this stays fast regardless of filtered set size.
    prisma.match.count({ where: { OR: [{ memberA: where }, { memberB: where }] } }),
  ]);

  return NextResponse.json({
    members,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    totals: { count: total, male: maleCount, female: femaleCount, totalMatches },
  });
});

// POST /api/admin/members — the Members page's "Add member" (Gil, Q30): a
// member who isn't joining a particular event. Same details and rules as an
// event's "Add a new member" (src/lib/adminMember.ts), without the booking.
//
// They're emailed "You've been registered with FastMatch": log in with the
// password FastMatch gave them (never in the email), or choose their own
// from a link. Whichever of email and mobile isn't confirmed gets its link or
// code, as if they'd signed up themselves.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = addMemberSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the member details.' }, { status: 400 });
  }
  const data = parsed.data;
  const checked = await checkNewMember(data, (name) => `${data.email} is already registered (${name}). Nothing was saved, so their password hasn't changed.`);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  const member = await prisma.member.create({ data: newMemberData(data, await bcrypt.hash(data.password, 12), checked.dob) });

  let registeredEmail = true;
  try {
    const { subject, html } = registeredByAdminEmail({ name: member.name, ...registeredLinks(member) });
    await sendEmail({ to: member.email, subject, html });
  } catch (err) {
    console.error(`Member ${member.id}: registered email failed`, err);
    registeredEmail = false;
  }
  const verificationEmail = member.emailVerified ? null : await sendEmailVerification(member);
  const verificationSms = member.mobileVerified ? null : await sendMobileVerification(member);

  return NextResponse.json({ member: { id: member.id, name: member.name }, notified: { registeredEmail, verificationEmail, verificationSms } });
});

