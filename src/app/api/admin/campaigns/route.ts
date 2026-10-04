import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { oneLine } from '@/lib/escapeHtml';
import { blastContentProblem, BLAST_PROBLEM_ON_SAVE } from '@/lib/campaigns/fields';

const campaignSchema = z.object({
  title: z.string().min(1),
  templateId: z.string().optional(),
  automated: z.boolean().default(false),
  ignorePreference: z.boolean().default(false),
  excludeBooked: z.boolean().default(false),
  excludeBookedEventId: z.string().min(1).nullable().optional(),

  sendEmail: z.boolean().default(true),
  fromName: z.string().default('FastMatch'),
  fromEmail: z.string().email().default('donotreply@fastmatch.com.au'),
  // One line, as in campaignPatchSchema: a subject is an email header.
  subject: z.string().transform(oneLine).optional(),
  heading: z.string().optional(),
  freeText: z.string().optional(),
  eventDetailsText: z.string().optional(),
  bookingLink: z.string().optional(),
  photoUrl: z.string().optional(),
  bannerImageUrl: z.string().optional(),
  venueLogoUrl: z.string().optional(),
  emailBody: z.string().optional(),

  sendSms: z.boolean().default(false),
  smsFromNumber: z.string().optional(),
  smsBody: z.string().optional(),

  filter: z.record(z.any()).default({}),
});

// GET /api/admin/campaigns — the Blasts list. Each row includes its most
// recent send's status, so the list can show "Unused" / "Sending" / "Sent"
// and the Actions column can decide Edit+Delete vs Duplicate+Stop-reusing.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { sends: { orderBy: { startedAt: 'desc' }, take: 1 } },
  });

  const withStatus = campaigns.map((c) => ({
    ...c,
    hasBeenSent: c.sends.length > 0,
    blastStatus: c.sends[0]?.status ?? 'UNUSED',
  }));

  return NextResponse.json(withStatus);
});

// POST /api/admin/campaigns — create a new blast. If templateId is given,
// the template's structured fields are COPIED into this campaign's own
// row (not left as a reference back to the shared template) — the whole
// point being that this specific blast's photo (or any other field) can
// then be swapped without touching the template or any other blast built
// from it. Any fields also passed directly in the body override the
// template's copied values, so "pick a template, then tweak the photo" is
// a single create call.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const body = await req.json();
  const parsed = campaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  let seeded: Partial<typeof data> = {};
  if (data.templateId) {
    const template = await prisma.campaignTemplate.findUniqueOrThrow({ where: { id: data.templateId } });
    seeded = {
      subject: template.subject == null ? undefined : oneLine(template.subject),
      heading: template.heading ?? undefined,
      freeText: template.freeText ?? undefined,
      eventDetailsText: template.eventDetailsText ?? undefined,
      bookingLink: template.bookingLink ?? undefined,
      photoUrl: template.photoUrl ?? undefined,
      bannerImageUrl: template.bannerImageUrl ?? undefined,
      emailBody: template.emailBody ?? undefined,
      smsBody: template.smsBody ?? undefined,
    };
  }

  // Explicit fields in the request always win over what the template seeded —
  // only fill in from the template where the caller didn't specify a value.
  const merged = { ...seeded, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };

  // A subject for email, a message for SMS — as on Edit Blast and at send.
  const problem = blastContentProblem(merged as { sendEmail: boolean; sendSms: boolean; subject?: string; smsBody?: string });
  if (problem) return NextResponse.json({ error: BLAST_PROBLEM_ON_SAVE[problem] }, { status: 400 });

  const campaign = await prisma.campaign.create({ data: merged as any });
  return NextResponse.json(campaign);
});
