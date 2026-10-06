'use client';

import { smsLength } from '@/lib/sms/smsLength';

/**
 * Under a blast's SMS text: its length and how many SMS it costs, counted on
 * what members receive, opt-out link included ("Opt out: …/optout",
 * src/lib/sms/optOut.ts) — each extra SMS is charged per member.
 */
export default function SmsCounter({ body, className = '' }: { body: string; className?: string }) {
  const sms = smsLength(body);
  return (
    <p className={`text-xs ${sms.messages > 1 ? 'font-bold text-coral' : 'text-ink/50'} ${className}`}>
      {sms.characters} characters incl. the opt-out link
      {sms.messages > 0 && <> · {sms.messages} SMS per member{sms.messages === 1 ? ` (${sms.remaining} left)` : ''}</>}
      {sms.unicode && ' · contains a special character (emoji or curly quote), so each SMS holds only 70'}
    </p>
  );
}
