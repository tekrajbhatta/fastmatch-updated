import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  let payload: { memberId: string; purpose: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 });
  }

  if (payload.purpose !== 'verify_email') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  await prisma.member.update({ where: { id: payload.memberId }, data: { emailVerified: true } });
  return NextResponse.json({ ok: true });
}
