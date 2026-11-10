import { NextRequest, NextResponse, after } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { approximateDateOfBirth } from '@/lib/age';
import { sendEmail } from '@/lib/emails/send';
import { tellAFriendEmail } from '@/lib/emails/friendEmail';
import { setPasswordToken } from '@/lib/memberBooking';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { nameProblemSentence } from '@/lib/personName';
import { hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';
import { isAustralianMobile } from '@/lib/mobile';
import { maskEmail } from '@/lib/logMask';

const bodySchema = z.object({
  email: z.string().trim().max(254, 'Please enter your friend’s email address.').email('Please enter your friend’s email address.'),
  name: z.string().trim().min(1, 'Please enter your friend’s first name.').max(100),
  // Australian mobiles only (Gil, Q21).
  mobile: z.string().trim().max(30, 'Please enter your friend’s Australian mobile number, like 0412 345 678.').refine(isAustralianMobile, 'Please enter your friend’s Australian mobile number, like 0412 345 678.'),
  gender: z.enum(['MALE', 'FEMALE'], { errorMap: () => ({ message: 'Please choose male or female.' }) }),
  age: z.coerce.number().int('Please enter their age in whole years.').min(18, 'FastMatch is for over-18s only.').max(99, 'Please check their age.'),
});

// POST /api/tell-a-friend — "Register friend". Creates an account for the
// friend and emails them "<member> has registered you with FastMatch", with a
// link to set their password and complete their profile (/set-password).
//
// Until they do, nothing else goes to them: the account is created with no
// marketing consent (they haven't given any — the inviter can't give it for
// them), so blasts skip it. They choose that themselves on /set-password.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check your friend’s details.' }, { status: 400 });
  }
  const f = parsed.data;
  const nameIssue = nameProblemSentence(f.name, 'their');
  if (nameIssue) return NextResponse.json({ error: nameIssue.replace('their name', 'your friend’s first name'), field: 'name' }, { status: 400 });

  if (f.email.toLowerCase() === member.email.toLowerCase()) {
    return NextResponse.json({ error: 'That’s your own email. Please enter your friend’s.' }, { status: 400 });
  }

  const invites = await hitRateLimit(rateKey('tell-a-friend', member.id), LIMITS.tellAFriend.limit, LIMITS.tellAFriend.windowMs);
  if (!invites.allowed) {
    return NextResponse.json(
      { error: "You've sent a lot of invitations in the last hour. Please try again later." },
      { status: 429 },
    );
  }

  // The reply goes now, the same for every address; the account and the
  // invitation are made after it (inviteFriend). Someone already on FastMatch
  // (or already invited) gets nothing, and telling the member otherwise —
  // in words, or by answering faster, as it did when only a new address
  // waited for the password hash and the email — would let anyone check
  // whether a person is on a dating site.
  const inviter = { id: member.id, name: member.name, cityId: member.cityId };
  after(() => inviteFriend(f, inviter));
  return NextResponse.json({ ok: true, name: f.name, email: f.email });
});

/**
 * Makes the friend's account and emails the invitation, after the reply.
 * Never throws. If the email can't go, the account is removed again, so a
 * later invitation can make it afresh. (A failed email used to be reported to
 * the member, but only ever for an address new to FastMatch — which gave the
 * difference away — so now it's logged for Gil instead.)
 */
async function inviteFriend(
  f: z.infer<typeof bodySchema>,
  inviter: { id: string; name: string; cityId: string | null },
): Promise<void> {
  try {
    if (await prisma.member.findUnique({ where: { email: f.email }, select: { id: true } })) return;

    const friend = await prisma.member.create({
      data: {
        name: f.name,
        email: f.email,
        mobile: f.mobile,
        gender: f.gender,
        // A placeholder from their age; they give their real date of birth when
        // they accept (see referredById in schema.prisma).
        dateOfBirth: approximateDateOfBirth(f.age),
        // Their city isn't asked for here, as on the old site — the inviter's is
        // the best guess, and they confirm it when they accept.
        cityId: inviter.cityId,
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
        awaitingPasswordSetup: true,
        emailVerified: false,
        mobileVerified: false,
        agreedTerms: false,
        marketingOptIn: false,
        referredById: inviter.id,
      },
    });

    const { subject, html } = tellAFriendEmail({
      friendName: friend.name,
      inviterName: inviter.name,
      setPasswordUrl: `${process.env.APP_URL}/set-password?token=${setPasswordToken(friend)}`,
    });
    try {
      await sendEmail({ to: friend.email, subject, html });
    } catch (err) {
      console.error(`Tell A Friend: invitation to ${maskEmail(friend.email)} (from member ${inviter.id}) failed`, err);
      await prisma.member.delete({ where: { id: friend.id } });
    }
  } catch (err) {
    // Most likely the same address invited twice at once: the other one made it.
    console.error(`Tell A Friend: invitation to ${maskEmail(f.email)} (from member ${inviter.id}) not made`, err);
  }
}
