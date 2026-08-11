import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/sms-credits — matches the "ClickATell indicates you have
// 194.250 credits remaining (this is not a dollar value)" banner on the
// real Blasts list. Balance comes live from the SMS provider, not stored.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  if (!process.env.SMS_PROVIDER_API_KEY) {
    return NextResponse.json({ credits: null, note: 'SMS provider not yet configured.' });
  }

  // TODO: call the actual provider's balance endpoint once chosen
  // (Clickatell has a GET /balance-style endpoint).
  return NextResponse.json({ credits: null, note: 'Provider balance check not yet implemented.' });
});
