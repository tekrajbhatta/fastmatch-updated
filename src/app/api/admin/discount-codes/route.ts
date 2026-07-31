import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';

const codeSchema = z.object({
  code: z.string().min(1).toUpperCase(),
  type: z.enum(['PERCENT_OFF', 'FIXED_REDUCTION', 'FREE']),
  amount: z.number().nonnegative().optional(),
  scopeThemeId: z.string().nullable().optional(),
  validFrom: z.string(),
  validTo: z.string(),
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const codes = await prisma.discountCode.findMany({ orderBy: { validFrom: 'desc' } });
  return NextResponse.json(codes);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = codeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const existing = await prisma.discountCode.findUnique({ where: { code: data.code } });
  if (existing) {
    return NextResponse.json(
      { error: 'That code already exists — edit it instead of creating a new one.' },
      { status: 409 }
    );
  }

  const created = await prisma.discountCode.create({
    data: {
      code: data.code,
      type: data.type,
      amount: data.amount,
      scopeThemeId: data.scopeThemeId ?? null,
      validFrom: new Date(data.validFrom),
      validTo: new Date(data.validTo),
    },
  });
  return NextResponse.json(created);
}
