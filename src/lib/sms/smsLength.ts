import { withOptOut } from './optOut';

/**
 * How long a blast SMS really is, and how many SMS it costs per member —
 * counted on the text members actually receive, opt-out line included.
 *
 * GSM-7 (plain text): 160 characters in one SMS, 153 per part beyond that.
 * One character outside GSM-7 (an emoji, curly quotes from Word…) switches
 * the whole message to Unicode: 70, then 67 per part.
 */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
// Allowed, but each costs two characters (escape + char).
const GSM_EXTENDED = '^{}\\[~]|€\f';

export interface SmsLength {
  characters: number;
  messages: number;
  unicode: boolean;
  /** Characters left before it tips into another SMS. */
  remaining: number;
}

export function smsLength(body: string): SmsLength {
  const text = withOptOut(body);
  const chars = [...text];
  const unicode = chars.some((ch) => !GSM_BASIC.includes(ch) && !GSM_EXTENDED.includes(ch));
  const characters = unicode ? chars.length : chars.reduce((n, ch) => n + (GSM_EXTENDED.includes(ch) ? 2 : 1), 0);

  const single = unicode ? 70 : 160;
  const part = unicode ? 67 : 153;
  const messages = characters === 0 ? 0 : characters <= single ? 1 : Math.ceil(characters / part);
  const capacity = messages <= 1 ? single : messages * part;
  return { characters, messages, unicode, remaining: capacity - characters };
}
