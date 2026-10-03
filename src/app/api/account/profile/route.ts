import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { signEmailVerificationToken } from '@/lib/tokens';
import { sendEmail } from '@/lib/emails/send';
import { welcomeVerificationEmail } from '@/lib/emails/welcomeEmail';
import { parseDateOfBirth } from '@/lib/friendBooking';
import { calculateAge } from '@/lib/age';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().min(1),
  cityId: z.string(),
  // YYYY-MM-DD. Optional so an older copy of the page that doesn't send it
  // still saves the rest. Age is always worked out from this, never stored.
  dateOfBirth: z.string().optional(),
});

// GET/PATCH /api/account/profile — a member viewing/editing their own
// profile, including email. Changing the email re-triggers the same
// verification flow used at registration (a new signed link sent to the new
// address) and flips emailVerified back to false — otherwise someone could
// silently swap in an address they don't own while staying "verified".
// Booking is already gated on emailVerified, so this can't be skipped
// unnoticed.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { passwordHash, mobileVerificationCode, ...safe } = member;
  return NextResponse.json(safe);
});

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please check your details.' }, { status: 400 });

  const { dateOfBirth, ...data } = parsed.data;
  let dob: Date | undefined;
  if (dateOfBirth !== undefined) {
    const d = parseDateOfBirth(dateOfBirth);
    if (!d) return NextResponse.json({ error: 'Please enter a valid date of birth.' }, { status: 400 });
    if (calculateAge(d) < 18) return NextResponse.json({ error: 'You must be at least 18 years old.' }, { status: 400 });
    dob = d;
  }
  const emailChanged = data.email.toLowerCase() !== member.email.toLowerCase();

  if (emailChanged) {
    // email is @unique in the schema — check first so this surfaces as a
    // clear 409 rather than a raw constraint violation.
    const existing = await prisma.member.findUnique({ where: { email: data.email } });
    if (existing && existing.id !== member.id) {
      return NextResponse.json({ error: 'That email is already in use by another account.' }, { status: 409 });
    }
  }

  const updated = await prisma.member.update({
    where: { id: member.id },
    data: { ...data, ...(dob ? { dateOfBirth: dob } : {}), ...(emailChanged ? { emailVerified: false } : {}) },
  });

  if (emailChanged) {
    // Tied to the NEW address (see tokens.ts).
    const verifyToken = signEmailVerificationToken(updated);
    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verifyToken}`;
    const { subject, html } = welcomeVerificationEmail({ memberName: updated.name, verifyUrl });
    await sendEmail({ to: updated.email, subject, html });
  }

  const { passwordHash, mobileVerificationCode, ...safe } = updated;
  return NextResponse.json({ ...safe, emailChanged });
});
