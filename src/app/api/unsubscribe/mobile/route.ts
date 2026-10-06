import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { australianMobile, sameMobile, AU_MOBILE_MESSAGE } from '@/lib/mobile';
import { hitRateLimit, rateKey, clientIp, LIMITS } from '@/lib/rateLimit';

const schema = z.object({ mobile: z.string().trim().min(1, 'Please enter your mobile number.').max(30) });

// POST /api/unsubscribe/mobile { mobile } — the opt-out link at the end of
// every blast text ("Opt out: …/optout"), for someone not signed in. Texts
// come from the name "Fastmatch", so they can't reply STOP (Gil, Q16); one
// link serves every recipient, and the number they enter says who they are.
//
// Every member with that number stops getting event news and offers (two
// members may share a number, Gil, Q21). They stay members: only marketing
// stops. The answer is the same whether or not the number is ours, so this
// can't be used to find out who's a member; and a few an hour per visitor.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please enter your mobile number.' }, { status: 400 });
  const wanted = australianMobile(parsed.data.mobile);
  if (!wanted) return NextResponse.json({ error: AU_MOBILE_MESSAGE }, { status: 400 });

  const tries = await hitRateLimit(rateKey('optout-ip', clientIp(req)), LIMITS.optOutIp.limit, LIMITS.optOutIp.windowMs);
  if (!tries.allowed) return NextResponse.json({ error: 'Too many tries. Please try again later, or email gil@fastmatch.com.au.' }, { status: 429 });

  // Numbers are saved as typed ("0412 345 678", "+61412345678"): narrowed on
  // their last nine digits, then compared properly.
  const candidates = await prisma.$queryRaw<{ id: string; mobile: string }[]>`
    SELECT id, mobile FROM \`Member\` WHERE REGEXP_REPLACE(mobile, '[^0-9]', '') LIKE ${`%${wanted.slice(-9)}`}`;
  const ids = candidates.filter((m) => sameMobile(m.mobile, wanted)).map((m) => m.id);
  if (ids.length) await prisma.member.updateMany({ where: { id: { in: ids } }, data: { marketingOptIn: false } });
  return NextResponse.json({ ok: true });
});
