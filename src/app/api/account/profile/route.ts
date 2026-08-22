import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { sendEmail } from '@/lib/emails/send';
import { welcomeVerificationEmail } from '@/lib/emails/welcomeEmail';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().min(1),
  cityId: z.string(),
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

  const data = parsed.data;
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
    data: { ...data, ...(emailChanged ? { emailVerified: false } : {}) },
  });

  if (emailChanged) {
    // Read JWT_SECRET here rather than at module scope: Next imports every
    // route module during `next build`, so module-scope env reads that can
    // throw break the production build.
    const jwtSecret = process.env.JWT_SECRET as string;
    const verifyToken = jwt.sign({ memberId: member.id, purpose: 'verify_email' }, jwtSecret, { expiresIn: '7d' });
    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verifyToken}`;
    const { subject, html } = welcomeVerificationEmail({ memberName: updated.name, verifyUrl });
    await sendEmail({ to: updated.email, subject, html });
  }

  const { passwordHash, mobileVerificationCode, ...safe } = updated;
  return NextResponse.json({ ...safe, emailChanged });
});
