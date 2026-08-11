import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/admin/campaigns/:id/duplicate — "Duplicate Blast", the action
// shown once a blast has been sent at least once (replaces Edit/Delete).
// Creates a fresh, fully-editable, Unused copy.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const original = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });

  const copy = await prisma.campaign.create({
    data: {
      title: `${original.title} (copy)`,
      templateId: original.templateId,
      automated: original.automated,
      ignorePreference: original.ignorePreference,
      sendEmail: original.sendEmail,
      fromName: original.fromName,
      fromEmail: original.fromEmail,
      subject: original.subject,
      emailBody: original.emailBody,
      sendSms: original.sendSms,
      smsFromNumber: original.smsFromNumber,
      smsBody: original.smsBody,
      filter: original.filter as any,
    },
  });

  return NextResponse.json(copy);
});
