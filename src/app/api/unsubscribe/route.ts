import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { withErrorHandling } from '@/lib/withErrorHandling';

const JWT_SECRET = process.env.JWT_SECRET as string;

// GET /api/unsubscribe?token=... — one-click unsubscribe link from campaign
// emails. Only turns off marketingOptIn — booking/event confirmations still
// go through, per what's already communicated on the Unsubscribe screen.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  let payload: { memberId: string; purpose: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'This unsubscribe link is invalid or has expired.' }, { status: 400 });
  }

  if (payload.purpose !== 'unsubscribe') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  await prisma.member.update({ where: { id: payload.memberId }, data: { marketingOptIn: false } });

  return NextResponse.json({ ok: true });
});
