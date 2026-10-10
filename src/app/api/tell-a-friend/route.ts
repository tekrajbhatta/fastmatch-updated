import { NextRequest, NextResponse } from 'next/server';
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

const bodySchema = z.object({
  email: z.string().trim().email('Please enter your friend’s email address.'),
  name: z.string().trim().min(1, 'Please enter your friend’s first name.').max(100),
  // Australian mobiles only (Gil, Q21).
  mobile: z.string().trim().refine(isAustralianMobile, 'Please enter your friend’s Australian mobile number, like 0412 345 678.'),
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

  // Someone already on FastMatch (or already invited) gets nothing, but the
  // reply is the same as for a new invitation: telling the member otherwise
  // would let anyone check whether a person is on a dating site.
  const existing = await prisma.member.findUnique({ where: { email: f.email } });
  if (existing) return NextResponse.json({ ok: true, name: f.name, email: f.email });

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
      cityId: member.cityId,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      awaitingPasswordSetup: true,
      emailVerified: false,
      mobileVerified: false,
      agreedTerms: false,
      marketingOptIn: false,
      referredById: member.id,
    },
  });

  const { subject, html } = tellAFriendEmail({
    friendName: friend.name,
    inviterName: member.name,
    setPasswordUrl: `${process.env.APP_URL}/set-password?token=${setPasswordToken(friend)}`,
  });
  try {
    await sendEmail({ to: friend.email, subject, html });
  } catch (err) {
    // No email, no invitation: remove the account so the member can simply
    // try again rather than being told "already invited".
    console.error(`Tell A Friend: invitation to ${friend.email} failed`, err);
    await prisma.member.delete({ where: { id: friend.id } });
    return NextResponse.json({ error: "Sorry, we couldn't send the invitation just now. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, name: friend.name, email: friend.email });
});
