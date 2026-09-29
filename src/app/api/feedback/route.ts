import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { sendEmail } from '@/lib/emails/send';
import { memberFeedbackEmail, FEEDBACK_TO } from '@/lib/emails/feedbackEmail';
import { formatEventWhen } from '@/lib/datetime';
import { timeZoneForCity } from '@/lib/timezone';
import { venueLine } from '@/lib/venue';
import { withErrorHandling } from '@/lib/withErrorHandling';

/** The member's events for "My feedback is about the event" — ones they've booked, newest first. */
async function feedbackEvents(memberId: string) {
  const bookings = await prisma.booking.findMany({
    where: { memberId, status: 'CONFIRMED' },
    include: { event: { include: { venue: true, city: true } } },
    orderBy: { event: { startsAt: 'desc' } },
    take: 30,
  });
  return bookings.map((b) => b.event);
}

// GET /api/feedback — the event choices for the Feedback page.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const events = await feedbackEvents(member.id);
  return NextResponse.json(events.map((e) => ({ id: e.id, name: e.name, startsAt: e.startsAt, venue: { name: e.venue.name }, city: { name: e.city.name } })));
});

const bodySchema = z.object({
  eventId: z.string().optional(),
  message: z.string().trim().min(1, 'Please write your feedback.').max(5000, 'Please keep it under 5,000 characters.'),
});

// POST /api/feedback — saves the member's feedback (Member Feedback in the
// admin) and emails it to Gil, with who sent it and which event it's about.
// Once saved it's safe, so an email hiccup is logged rather than reported to
// the member as a failure — it's still there on /admin/feedback.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check your feedback.' }, { status: 400 });

  let event = null;
  if (parsed.data.eventId) {
    // Only an event they were actually booked into.
    event = (await feedbackEvents(member.id)).find((e) => e.id === parsed.data.eventId) ?? null;
    if (!event) return NextResponse.json({ error: 'Please choose one of your events.' }, { status: 400 });
  }

  await prisma.feedback.create({ data: { memberId: member.id, eventId: event?.id ?? null, message: parsed.data.message } });

  const { subject, html } = memberFeedbackEmail({
    member,
    event: event ? { name: event.name, venue: venueLine(event.venue), // The event's own local time — what Gil thinks of it as.
    when: formatEventWhen(event.startsAt, timeZoneForCity(event.city.name)) } : null,
    message: parsed.data.message,
  });
  try {
    await sendEmail({ to: FEEDBACK_TO, subject, html });
  } catch (err) {
    console.error(`Feedback from member ${member.id} saved but could not be emailed`, err);
  }
  return NextResponse.json({ ok: true });
});
