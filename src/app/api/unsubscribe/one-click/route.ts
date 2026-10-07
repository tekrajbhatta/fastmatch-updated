import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readPurposeToken } from '@/lib/tokens';
import { withErrorHandling } from '@/lib/withErrorHandling';

/**
 * The one-click unsubscribe in blast emails' List-Unsubscribe header (RFC
 * 8058; Gil, 7 Oct): Gmail, Yahoo and others show their own "Unsubscribe"
 * button from it, and POST here when it's pressed — the press itself is the
 * member's choice, so there's no question to answer first. Like every
 * unsubscribe, it stops event news and offers only: they stay a member and
 * still get emails about their own bookings.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const read = token ? readPurposeToken(token, 'unsubscribe') : null;
  if (!read?.ok) return NextResponse.json({ error: 'This unsubscribe link is invalid or has expired.' }, { status: 400 });
  // updateMany: the account may have been removed since the email was sent.
  await prisma.member.updateMany({ where: { id: read.memberId }, data: { marketingOptIn: false } });
  return NextResponse.json({ ok: true });
});

/**
 * Opened as a link instead (or checked by a mail scanner): nothing changes.
 * It goes to the unsubscribe page, which asks first, as the footer link does.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  return NextResponse.redirect(new URL(`/unsubscribe?token=${encodeURIComponent(token)}`, process.env.APP_URL || req.url));
});
