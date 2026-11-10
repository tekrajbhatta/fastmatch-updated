import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/auth/logout — clears the session cookie. fm_device stays: it
// isn't a login, only "this browser has logged in to the account before"
// (src/lib/auth.ts), which lets it past the per-account login limit.
export const POST = withErrorHandling(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('fm_session', '', { maxAge: 0 });
  return res;
});
