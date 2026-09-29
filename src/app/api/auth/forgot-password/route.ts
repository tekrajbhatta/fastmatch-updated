import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { sendEmail } from '@/lib/emails/send';
import { passwordResetEmail } from '@/lib/emails/passwordEmail';
import { withErrorHandling } from '@/lib/withErrorHandling';

const JWT_SECRET = process.env.JWT_SECRET as string;
const RESET_LINK_MINUTES = 30;

const bodySchema = z.object({ email: z.string().email() });

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });

  const member = await prisma.member.findUnique({ where: { email: parsed.data.email } });

  // Always return success, whether or not the email exists — don't let this
  // endpoint be used to check which emails are registered.
  if (member) {
    const resetToken = jwt.sign({ memberId: member.id, purpose: 'password_reset' }, JWT_SECRET, {
      expiresIn: `${RESET_LINK_MINUTES}m`,
    });
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    const { subject, html } = passwordResetEmail({ memberName: member.name, resetUrl, validMinutes: RESET_LINK_MINUTES });
    try {
      await sendEmail({ to: member.email, subject, html });
    } catch (err) {
      // Logged, not returned: an error here would reveal the address exists.
      console.error(`Password reset email to member ${member.id} failed`, err);
    }
  }

  return NextResponse.json({ ok: true });
});
