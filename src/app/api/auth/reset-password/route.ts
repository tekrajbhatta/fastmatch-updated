import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET as string;

const bodySchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

export async function POST(req: NextRequest) {
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
  await prisma.member.update({ where: { id: payload.memberId }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
