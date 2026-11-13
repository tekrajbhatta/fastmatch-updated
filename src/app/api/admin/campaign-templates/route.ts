import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { blastText, blastRichText, blastPicture, blastLink, blastSubject } from '@/lib/campaigns/fields';

// A template's fields are copied into blasts made from it, so they follow the
// blast's own rules (src/lib/campaigns/fields.ts): limits, web addresses for
// the pictures and link, a one-line subject.
const templateSchema = z.object({
  title: z.string().trim().min(1, 'Please give the template a title.').max(200),
  subject: blastSubject.optional(),
  heading: blastRichText,
  freeText: blastRichText,
  eventDetailsText: blastText,
  bookingLink: blastLink,
  photoUrl: blastPicture,
  bannerImageUrl: blastPicture,
  emailBody: blastText,
  smsBody: blastText,
});

// GET /api/admin/campaign-templates — the "Blast Template" dropdown options
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const templates = await prisma.campaignTemplate.findMany({ orderBy: { title: 'asc' } });
  return NextResponse.json(templates);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = templateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the template.' }, { status: 400 });

  const template = await prisma.campaignTemplate.create({ data: parsed.data });
  return NextResponse.json(template);
});
