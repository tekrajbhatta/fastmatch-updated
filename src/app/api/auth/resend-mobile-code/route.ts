import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { sendSms } from '@/lib/sms/send';
import { verificationCodeSms } from '@/lib/sms/verificationSms';

export async function POST(req: NextRequest) {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (member.mobileVerified) {
    return NextResponse.json({ error: 'Your mobile is already verified.' }, { status: 400 });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.member.update({
    where: { id: member.id },
    data: { mobileVerificationCode: code, mobileVerificationExpires: new Date(Date.now() + 15 * 60 * 1000) },
  });
  await sendSms({ to: member.mobile, body: verificationCodeSms(code) });

  return NextResponse.json({ ok: true });
}
