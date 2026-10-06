import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readPurposeToken } from '@/lib/tokens';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/unsubscribe { token } — the Unsubscribe link in blast emails,
// once the member has chosen to unsubscribe on the page it opens (Gil, Q16:
// they're asked first whether they'd rather keep hearing about events).
// Only turns off marketing: they stay a member, book as before, and still get
// emails about their own bookings (the user, 6 Oct).
//
// It used to unsubscribe as soon as the page was opened (a GET), so a mail
// program checking the link for safety could unsubscribe someone by itself.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  const read = token ? readPurposeToken(token, 'unsubscribe') : null;
  if (!read?.ok) return NextResponse.json({ error: 'This unsubscribe link is invalid or has expired.' }, { status: 400 });

  // updateMany: the account may have been removed since the email was sent.
  await prisma.member.updateMany({ where: { id: read.memberId }, data: { marketingOptIn: false } });
  return NextResponse.json({ ok: true });
});
