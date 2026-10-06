'use client';

import { smsLength } from '@/lib/sms/smsLength';
import { mentionsReplyStop } from '@/lib/sms/optOut';

/**
 * Under a blast's SMS text: its length and how many SMS it costs, counted on
 * what members receive, opt-out link included ("Opt out: …/optout",
 * src/lib/sms/optOut.ts) — each extra SMS is charged per member.
 *
 * A text asking members to reply STOP is pointed out: nobody can reply to
 * texts from "Fastmatch", and two ways to opt out, one that doesn't work,
 * would only confuse them (the user, 6 Oct).
 */
export default function SmsCounter({ body, className = '' }: { body: string; className?: string }) {
  const sms = smsLength(body);
  return (
    <>
      <p className={`text-xs ${sms.messages > 1 ? 'font-bold text-coral' : 'text-ink/50'} ${className}`}>
        {sms.characters} characters incl. the opt-out link
        {sms.messages > 0 && <> · {sms.messages} SMS per member{sms.messages === 1 ? ` (${sms.remaining} left)` : ''}</>}
        {sms.unicode && ' · contains a special character (emoji or curly quote), so each SMS holds only 70'}
      </p>
      {mentionsReplyStop(body) && (
        <p className="mt-1 text-xs font-bold text-coral">
          Members can&apos;t reply to texts from Fastmatch, so replying STOP won&apos;t work. Please take that part out: the opt-out link is added to the end of every text.
        </p>
      )}
    </>
  );
}
