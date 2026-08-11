import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/auth/logout — clears the session cookie
export const POST = withErrorHandling(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('fm_session', '', { maxAge: 0 });
  return res;
});
