import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';

const campaignSchema = z.object({
  title: z.string().min(1),
  templateId: z.string().optional(),
  automated: z.boolean().default(false),
  ignorePreference: z.boolean().default(false),

  sendEmail: z.boolean().default(true),
  fromName: z.string().default('FastMatch'),
  fromEmail: z.string().email().default('donotreply@fastmatch.com.au'),
  subject: z.string().optional(),
  emailBody: z.string().optional(),

  sendSms: z.boolean().default(false),
  smsFromNumber: z.string().optional(),
  smsBody: z.string().optional(),

  filter: z.record(z.any()).default({}),
});

// GET /api/admin/campaigns — the Blasts list. Each row includes its most
// recent send's status, so the list can show "Unused" / "Sending" / "Sent"
// and the Actions column can decide Edit+Delete vs Duplicate+Stop-reusing.
export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = campaignSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  if (!data.sendEmail && !data.sendSms) {
    return NextResponse.json({ error: 'At least one of Send Email or Send SMS must be on.' }, { status: 400 });
  }
  if (data.sendEmail && !data.subject) {
    return NextResponse.json({ error: 'Subject is required when sending email.' }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({ data });
  return NextResponse.json(campaign);
}
