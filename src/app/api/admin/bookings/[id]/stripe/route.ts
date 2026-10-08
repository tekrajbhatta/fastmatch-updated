import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { getStripe } from '@/lib/stripe';
import { stripePaymentUrl } from '@/lib/stripePayment';

/**
 * GET /api/admin/bookings/:id/stripe — the card payment in Stripe behind a
 * booking paid online: its reference ("pi_…") and its page in the Stripe
 * Dashboard, so the admin can find it (to refund it, say) without searching
 * Stripe by email. A friend's place was paid in the member's payment who
 * brought them, so that's the one shown.
 *
 * With ?open=1 it goes straight to that page in Stripe (the bookings list's
 * "View in Stripe" link); otherwise it answers with the reference.
 *
 * The booking keeps only its Checkout Session id (stripePaymentIntentId, despite
 * the name): the payment is looked up from it when asked for.
 */
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      stripePaymentIntentId: true,
      bookedBy: { select: { stripePaymentIntentId: true, member: { select: { name: true } } } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'That booking no longer exists.' }, { status: 404 });

  const sessionId = booking.bookedBy?.stripePaymentIntentId ?? booking.stripePaymentIntentId;
  const open = req.nextUrl.searchParams.get('open') === '1';
  const none = (reason: string) =>
    open
      ? new NextResponse(reason, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      : NextResponse.json({ payment: null, reason });
  if (!sessionId) return none('This booking has no card payment in Stripe.');

  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  if (!paymentId) return none("This booking's payment page was never paid, so there is no payment in Stripe.");

  const url = stripePaymentUrl(paymentId, session.livemode);
  if (open) return NextResponse.redirect(url);
  return NextResponse.json({ payment: { reference: paymentId, url, paidBy: booking.bookedBy?.member.name ?? null } });
});
