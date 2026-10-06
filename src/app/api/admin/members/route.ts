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
import { registeredByAdminEmail, REGISTERED_PASSWORD_LINK_DAYS } from '@/lib/emails/signupEmails';
import { signPasswordResetToken } from '@/lib/tokens';

const PAGE_SIZE = 50;

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
  const page = Math.max(1, Number(params.get('page') ?? 1));
  // Same parsing as the members screen and its blast page — see memberFilterFromParams.
  const filter: MemberFilter = memberFilterFromParams(params);
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

  const parsed = newMemberSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the member details.' }, { status: 400 });
  }
  const data = parsed.data;
  const checked = await checkNewMember(data, (name) => `${data.email} is already registered (${name}). Nothing was saved, so their password hasn't changed.`);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  const member = await prisma.member.create({ data: newMemberData(data, await bcrypt.hash(data.password, 12), checked.dob) });

  const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  let registeredEmail = true;
  try {
    const { subject, html } = registeredByAdminEmail({
      name: member.name,
      loginUrl: `${appUrl}/login`,
      choosePasswordUrl: `${appUrl}/reset-password?token=${signPasswordResetToken(member, REGISTERED_PASSWORD_LINK_DAYS * 24 * 60)}`,
    });
    await sendEmail({ to: member.email, subject, html });
  } catch (err) {
    console.error(`Member ${member.id}: registered email failed`, err);
    registeredEmail = false;
  }
  const verificationEmail = member.emailVerified ? null : await sendEmailVerification(member);
  const verificationSms = member.mobileVerified ? null : await sendMobileVerification(member);

  return NextResponse.json({ member: { id: member.id, name: member.name }, notified: { registeredEmail, verificationEmail, verificationSms } });
});

