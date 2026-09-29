import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/withErrorHandling';

const JWT_SECRET = process.env.JWT_SECRET as string;

const bodySchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  let payload: { memberId: string; purpose: string };
  try {
    payload = jwt.verify(parsed.data.token, JWT_SECRET) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Reset link is invalid or has expired.' }, { status: 400 });
  }

  if (payload.purpose !== 'password_reset') {
    return NextResponse.json({ error: 'Invalid reset token' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const member = await prisma.member.findUnique({ where: { id: payload.memberId } });
  if (!member) return NextResponse.json({ error: 'Reset link is invalid or has expired.' }, { status: 400 });
  await prisma.member.update({
    where: { id: member.id },
    data: {
      passwordHash,
      // A friend whose "set your password" link expired can come in this way
      // instead: treat it exactly as setting their first password — the
      // welcome link then stops working, and the email is proven theirs.
      ...(member.awaitingPasswordSetup ? { awaitingPasswordSetup: false, emailVerified: true } : {}),
    },
  });

  return NextResponse.json({ ok: true });
});
