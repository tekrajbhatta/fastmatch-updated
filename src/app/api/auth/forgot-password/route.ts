import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/withErrorHandling';

const JWT_SECRET = process.env.JWT_SECRET as string;

const bodySchema = z.object({ email: z.string().email() });

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });

  const member = await prisma.member.findUnique({ where: { email: parsed.data.email } });

  // Always return success, whether or not the email exists — don't let this
  // endpoint be used to check which emails are registered.
  if (member) {
    const resetToken = jwt.sign({ memberId: member.id, purpose: 'password_reset' }, JWT_SECRET, {
      expiresIn: '30m',
    });
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;

    // TODO: send via the email provider — see sendMatchEmails.ts for the pattern.
    console.log(`[stub] Password reset link for ${member.email}: ${resetUrl}`);
  }

  return NextResponse.json({ ok: true });
});
