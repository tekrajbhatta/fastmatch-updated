import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/sms-credits — powers the credits banner on the Blasts list
// (the old site showed "…indicates you have 194.250 credits remaining (this
// is not a dollar value)"). Balance comes live from Cellcast, not stored
// locally.
//
// Cellcast: GET https://api.cellcast.com/api/v1/apiClient/account
//   { "meta": { "code": 200, "status": "SUCCESS" },
//     "data": { "account_name", "account_email", "sms_balance", "mms_balance" } }
// https://developer.cellcast.com/api-docs/get-account.html
const ACCOUNT_URL = 'https://api.cellcast.com/api/v1/apiClient/account';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  if (!process.env.CELLCAST_API_KEY) {
    return NextResponse.json({ credits: null, note: 'SMS provider not yet configured.' });
  }

  try {
    const res = await fetch(process.env.CELLCAST_ACCOUNT_URL || ACCOUNT_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.CELLCAST_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // The banner is decorative — don't let a slow provider hold up the page.
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error(`Cellcast account lookup failed (HTTP ${res.status})`);
      return NextResponse.json({ credits: null, note: 'Could not reach the SMS provider.' });
    }

    const body = (await res.json()) as Record<string, any>;
    const credits = body?.data?.sms_balance;

    if (typeof credits !== 'number') {
      console.error('Cellcast account response had no numeric sms_balance:', body);
      return NextResponse.json({ credits: null, note: 'Provider returned no balance.' });
    }

    return NextResponse.json({
      credits,
      accountName: body?.data?.account_name ?? null,
      note: null,
    });
  } catch (err) {
    console.error('Cellcast account lookup threw:', err);
    return NextResponse.json({ credits: null, note: 'Could not reach the SMS provider.' });
  }
});
