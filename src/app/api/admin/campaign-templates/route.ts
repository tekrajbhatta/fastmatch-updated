import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';

const templateSchema = z.object({
  title: z.string().min(1),
  subject: z.string().optional(),
  emailBody: z.string().optional(),
  smsBody: z.string().optional(),
});

// GET /api/admin/campaign-templates — the "Blast Template" dropdown options
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const templates = await prisma.campaignTemplate.findMany({ orderBy: { title: 'asc' } });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = templateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const template = await prisma.campaignTemplate.create({ data: parsed.data });
  return NextResponse.json(template);
}
