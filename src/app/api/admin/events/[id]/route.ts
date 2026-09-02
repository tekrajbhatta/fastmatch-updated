import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { sendEmail } from '@/lib/emails/send';
import { sendSms } from '@/lib/sms/send';
import { eventChangeEmail, eventChangeSms } from '@/lib/emails/eventEmails';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { venueLine } from '@/lib/venue';

// PATCH /api/admin/events/:id — edit any field. Attendees are notified by
// email and SMS ONLY when the date/time, the venue, or the event's public
// visibility (i.e. a cancellation) changes.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const updates = await req.json();
  const before = await prisma.event.findUniqueOrThrow({
    where: { id: params.id },
    include: { venue: true, theme: true },
  });
  const event = await prisma.event.update({
    where: { id: params.id },
    data: updates,
    include: { venue: true, theme: true },
  });

  let notified = 0;
  const notifyFailures: { member: string; channel: 'email' | 'sms' }[] = [];

  // ONLY these three things notify attendees. Everything else on this form —
  // expenses, cost, capacity, age range, name, theme — is admin bookkeeping
  // that no attendee needs a text about.
  //
  // This used to compare startsAt alone, but the edit form round-tripped the
  // timestamp through a timezone bug (see src/lib/datetime.ts), so the value
  // differed on EVERY save and adding $100 of expenses texted the whole
  // event. Both halves are fixed: the form no longer corrupts the timestamp,
  // and the comparison below is explicit about what counts as a change.
  const timeChanged = before.startsAt.getTime() !== new Date(event.startsAt).getTime();
  const venueChanged = before.venueId !== event.venueId;
  // Gil's definition: cancelling an event means unchecking "Visible to the
  // public". Only the PUBLIC -> NOT_PUBLIC direction is a cancellation;
  // re-publishing something is not an event worth texting about.
  const cancelled = before.visibility === 'PUBLIC' && event.visibility === 'NOT_PUBLIC';

  if (timeChanged || venueChanged || cancelled) {
    const change = {
      eventName: event.name,
      themeName: event.theme.name,
      ageMin: event.ageMin,
      ageMax: event.ageMax,
      oldVenue: before.venue.name,
      newVenue: event.venue.name,
      newVenueFull: venueLine(event.venue),
      oldStartsAt: before.startsAt,
      newStartsAt: new Date(event.startsAt),
      venueChanged,
      timeChanged,
      cancelled,
    };

    const bookings = await prisma.booking.findMany({
      where: { eventId: event.id, status: 'CONFIRMED' },
      include: { member: true },
    });

    // The event is already saved by this point, so a single bad number or a
    // provider hiccup must not throw — that would 500 the admin AND silently
    // strand every attendee after the failure, with no way to tell who was
    // notified. Each send is isolated and failures are reported back so the
    // admin can follow up.
    for (const booking of bookings) {
      const { subject, html } = eventChangeEmail({ ...change, memberName: booking.member.name });
      try {
        await sendEmail({ to: booking.member.email, subject, html });
      } catch (err) {
        console.error(`Event ${event.id}: change email to ${booking.member.email} failed`, err);
        notifyFailures.push({ member: booking.member.name, channel: 'email' });
      }
      try {
        await sendSms({ to: booking.member.mobile, body: eventChangeSms(change) });
      } catch (err) {
        console.error(`Event ${event.id}: change SMS to ${booking.member.mobile} failed`, err);
        notifyFailures.push({ member: booking.member.name, channel: 'sms' });
      }
    }

    notified = bookings.length;
  }

  return NextResponse.json({ ...event, notified, notifyFailures });
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
