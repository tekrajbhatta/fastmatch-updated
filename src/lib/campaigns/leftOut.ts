/**
 * Why a blast leaves out some of the members a filter matches, with a count
 * for each reason (Gil, 4 Nov: "1 of the 11 filtered members will receive
 * this blast" listed every possible reason, so it looked like a bug; the
 * user, 13 Nov: show the numbers, and who).
 *
 * The send decides who gets a blast (src/lib/campaigns/audience.ts). This
 * file only explains that decision for each member left out, from the same
 * settings: event news and offers, account set up, already booked (with
 * "Exclude booked members"), and for each channel the blast uses, the
 * member's contact choice (unless "Ignore preference") and whether the
 * address works. Each member is counted once, under one reason, so the
 * counts add up to everyone left out.
 *
 * No imports: the blast page uses it in the browser to word the counts.
 */

export type EmailProblem = 'preference' | 'bounced' | 'unconfirmed';
export type SmsProblem = 'preference' | 'no-mobile' | 'unconfirmed';

/** What the reasons are worked out from: a member's settings, as the send reads them. */
export interface LeftOutMember {
  marketingOptIn: boolean;
  awaitingPasswordSetup: boolean;
  emailVerified: boolean;
  emailBounced: boolean;
  mobileVerified: boolean;
  contactMethod: string;
  /** Has a mobile number at all (some imported members have none). */
  hasMobile: boolean;
  /** Has a paid booking that "Exclude booked members" counts. */
  booked: boolean;
}

export interface LeftOutBlast {
  sendEmail: boolean;
  sendSms: boolean;
  ignorePreference: boolean;
  excludeBooked?: boolean;
}

export interface LeftOutGroup { key: string; count: number }

const EMAIL_CHOICES = ['EMAIL_AND_SMS', 'EMAIL'];
const SMS_CHOICES = ['EMAIL_AND_SMS', 'SMS'];

/** Why an email can't go to this member, or null if it can. */
export function emailProblem(m: LeftOutMember, blast: LeftOutBlast): EmailProblem | null {
  if (!blast.ignorePreference && !EMAIL_CHOICES.includes(m.contactMethod)) return 'preference';
  // Bounced first: an address that bounces can't be confirmed either.
  if (m.emailBounced) return 'bounced';
  if (!m.emailVerified) return 'unconfirmed';
  return null;
}

/** Why a text can't go to this member, or null if it can. */
export function smsProblem(m: LeftOutMember, blast: LeftOutBlast): SmsProblem | null {
  if (!blast.ignorePreference && !SMS_CHOICES.includes(m.contactMethod)) return 'preference';
  if (!m.mobileVerified) return m.hasMobile ? 'unconfirmed' : 'no-mobile';
  return null;
}

/**
 * Why the blast leaves this member out, or null if it reaches them. Keys:
 * "unsubscribed", "not-set-up", "booked", "email:<problem>", "sms:<problem>",
 * or both joined with "+" when a blast that's emailed and texted can do
 * neither.
 */
export function leftOutReason(m: LeftOutMember, blast: LeftOutBlast): string | null {
  if (!blast.sendEmail && !blast.sendSms) return 'no-channel';
  if (!m.marketingOptIn) return 'unsubscribed';
  if (m.awaitingPasswordSetup) return 'not-set-up';
  if (blast.excludeBooked && m.booked) return 'booked';
  const email = blast.sendEmail ? emailProblem(m, blast) : null;
  const sms = blast.sendSms ? smsProblem(m, blast) : null;
  if ((blast.sendEmail && !email) || (blast.sendSms && !sms)) return null;
  return [email && `email:${email}`, sms && `sms:${sms}`].filter(Boolean).join('+');
}

const EMAIL_PROBLEMS: EmailProblem[] = ['preference', 'unconfirmed', 'bounced'];
const SMS_PROBLEMS: SmsProblem[] = ['preference', 'no-mobile', 'unconfirmed'];

/** Every key, in the order reasons with the same count are listed. */
export const LEFT_OUT_ORDER: string[] = [
  'unsubscribed', 'not-set-up', 'booked',
  ...EMAIL_PROBLEMS.map((e) => `email:${e}`),
  ...SMS_PROBLEMS.map((s) => `sms:${s}`),
  ...EMAIL_PROBLEMS.flatMap((e) => SMS_PROBLEMS.map((s) => `email:${e}+sms:${s}`)),
];

/** Largest group first; equal ones in the order above. */
export function sortLeftOut<T extends LeftOutGroup>(groups: T[]): T[] {
  const rank = (key: string) => {
    const i = LEFT_OUT_ORDER.indexOf(key);
    return i === -1 ? LEFT_OUT_ORDER.length : i;
  };
  return [...groups].sort((a, b) => b.count - a.count || rank(a.key) - rank(b.key));
}

type Wording = readonly [one: string, many: string];

const MEMBER_WORDING: Record<string, Wording> = {
  unsubscribed: ['has unsubscribed from event news and offers', 'have unsubscribed from event news and offers'],
  'not-set-up': ['hasn’t set up their account yet', 'haven’t set up their account yet'],
  booked: ['has already booked', 'have already booked'],
  'no-channel': ['gets nothing until “Send Email” or “Send SMS” is ticked', 'get nothing until “Send Email” or “Send SMS” is ticked'],
};
const EMAIL_WORDING: Record<EmailProblem, Wording> = {
  preference: ['doesn’t want to be contacted by email', 'don’t want to be contacted by email'],
  unconfirmed: ['hasn’t confirmed their email address', 'haven’t confirmed their email address'],
  bounced: ['has an email address that bounced', 'have an email address that bounced'],
};
const SMS_WORDING: Record<SmsProblem, Wording> = {
  preference: ['doesn’t want to be contacted by SMS', 'don’t want to be contacted by SMS'],
  'no-mobile': ['has no mobile number', 'have no mobile number'],
  unconfirmed: ['hasn’t confirmed their mobile', 'haven’t confirmed their mobile'],
};

function wording(key: string): Wording {
  if (MEMBER_WORDING[key]) return MEMBER_WORDING[key];
  let email: Wording | undefined;
  let sms: Wording | undefined;
  for (const part of key.split('+')) {
    const [channel, problem] = part.split(':');
    if (channel === 'email') email = EMAIL_WORDING[problem as EmailProblem];
    if (channel === 'sms') sms = SMS_WORDING[problem as SmsProblem];
  }
  if (email && sms) {
    if (key === 'email:preference+sms:preference') return ['doesn’t want to be contacted by email or SMS', 'don’t want to be contacted by email or SMS'];
    if (key === 'email:unconfirmed+sms:unconfirmed') return ['hasn’t confirmed their email address or mobile', 'haven’t confirmed their email address or mobile'];
    return [`${email[0]} and ${sms[0]}`, `${email[1]} and ${sms[1]}`];
  }
  return email ?? sms ?? ['can’t be reached', 'can’t be reached'];
}

/** "7 have an email address that bounced", "1 has unsubscribed from event news and offers". */
export function leftOutPart(group: LeftOutGroup): string {
  const [one, many] = wording(group.key);
  return `${group.count.toLocaleString('en-AU')} ${group.count === 1 ? one : many}`;
}

/** "Left out: 7 have an email address that bounced, 1 has unsubscribed from event news and offers." */
export function leftOutSentence(groups: LeftOutGroup[]): string {
  return `Left out: ${sortLeftOut(groups).map(leftOutPart).join(', ')}.`;
}
