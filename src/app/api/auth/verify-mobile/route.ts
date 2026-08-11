import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

const bodySchema = z.object({ code: z.string().length(6) });

export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Enter the 6-digit code from your SMS.' }, { status: 400 });

  if (!member.mobileVerificationCode || !member.mobileVerificationExpires) {
    return NextResponse.json({ error: 'No verification code pending — request a new one.' }, { status: 400 });
  }
  if (member.mobileVerificationExpires < new Date()) {
    return NextResponse.json({ error: 'This code has expired — request a new one.' }, { status: 400 });
  }
  if (parsed.data.code !== member.mobileVerificationCode) {
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 });
  }

  await prisma.member.update({
    where: { id: member.id },
    data: { mobileVerified: true, mobileVerificationCode: null, mobileVerificationExpires: null },
  });

  return NextResponse.json({ ok: true });
});
