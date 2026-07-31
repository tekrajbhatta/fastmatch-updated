import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signSession } from '@/lib/auth';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
  }

  const member = await prisma.member.findUnique({ where: { email: parsed.data.email } });

  // Same error message whether the email doesn't exist or the password is
  // wrong — don't reveal which one, so this can't be used to enumerate emails.
  const invalid = () => NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  if (!member) return invalid();
  const ok = await bcrypt.compare(parsed.data.password, member.passwordHash);
  if (!ok) return invalid();

  const token = signSession(member.id);
  const res = NextResponse.json({ id: member.id, name: member.name, isAdmin: member.isAdmin });
  res.cookies.set('fm_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
