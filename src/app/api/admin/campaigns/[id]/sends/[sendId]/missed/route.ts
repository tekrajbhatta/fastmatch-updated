import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { startMissedSend, processCampaignSendBatch } from '@/lib/campaigns/runSend';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { BLAST_PROBLEM_ON_SEND } from '@/lib/campaigns/fields';

// POST .../sends/:sendId/missed — History's "Send to the N who missed out":
// the blast's email again, to the members that send's email didn't reach
// because Mailgun kept saying "try again later" (src/lib/campaigns/runSend.ts).
// Answers straight away, then sends the first batch, as Send Blast Now does.
// Allowed for a blast set to stop re-using too: it finishes a send, rather
// than sending the blast again.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string; sendId: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) return NextResponse.json({ error: 'That blast wasn’t found.' }, { status: 404 });
  if (!campaign.sendEmail) {
    return NextResponse.json({ error: 'This blast no longer sends an email. Turn on Send Email with Edit Blast to send it to them.' }, { status: 400 });
  }
  if (!(campaign.subject ?? '').trim()) return NextResponse.json({ error: BLAST_PROBLEM_ON_SEND['no-subject'] }, { status: 400 });

  const started = await startMissedSend(params.id, params.sendId);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.notFound ? 404 : 409 });
  after(() =>
    processCampaignSendBatch(started.sendId).catch((err) => console.error(`Campaign send ${started.sendId}: first batch failed`, err)),
  );
  return NextResponse.json({ sendId: started.sendId, status: 'SENDING', sentCount: 0, totalRecipients: started.totalRecipients });
});
