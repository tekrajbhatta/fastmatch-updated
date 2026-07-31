import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { sendEmail } from '@/lib/emails/send';
import { sendSms } from '@/lib/sms/send';
import { eventChangeEmail, eventChangeSms } from '@/lib/emails/eventEmails';
import { withErrorHandling } from '@/lib/withErrorHandling';

// PATCH /api/admin/events/:id — edit fields, e.g. toggle visibility, or
// reschedule the date/time. A changed startsAt notifies every confirmed
// booking by both email and SMS, per the confirmed communication flow.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const updates = await req.json();
  const before = await prisma.event.findUniqueOrThrow({ where: { id: params.id } });
  const event = await prisma.event.update({ where: { id: params.id }, data: updates });

  const oldTime = before.startsAt.getTime();
  const newTime = new Date(event.startsAt).getTime();
  if (oldTime !== newTime) {
    const bookings = await prisma.booking.findMany({
      where: { eventId: event.id, status: 'CONFIRMED' },
      include: { member: true },
    });

    for (const booking of bookings) {
      const { subject, html } = eventChangeEmail({
        memberName: booking.member.name,
        eventName: event.name,
        oldStartsAt: before.startsAt,
        newStartsAt: event.startsAt,
      });
      await sendEmail({ to: booking.member.email, subject, html });
      await sendSms({
        to: booking.member.mobile,
        body: eventChangeSms({ eventName: event.name, newStartsAt: event.startsAt }),
      });
    }
  }

  return NextResponse.json(event);
});

// DELETE /api/admin/events/:id — same rule as the series bulk action: no
// bookings -> actually deleted; has bookings -> cancelled instead.
export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.id },
    include: { _count: { select: { bookings: true } } },
  });

  if (event._count.bookings === 0) {
    await prisma.event.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, action: 'deleted' });
  }

  await prisma.event.update({ where: { id: params.id }, data: { status: 'CANCELLED' } });
  return NextResponse.json({ ok: true, action: 'cancelled' });
});
