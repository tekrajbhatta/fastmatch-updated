import { describe, it, expect } from 'vitest';
import { smsLength } from '@/lib/sms/smsLength';
import { smsOptOutLine } from '@/lib/sms/send';

// The site's address, as on the live site (the line is built from APP_URL).
process.env.APP_URL = 'https://5minutedating.com.au';
const optOut = smsOptOutLine().length + 1; // plus the newline before it

describe('smsLength', () => {
  it('counts the opt-out line members actually receive', () => {
    expect(smsLength('Hi').characters).toBe(2 + optOut);
  });

  it('counts the link on a text that asks for a STOP reply too: it gets the link all the same', () => {
    const own = 'Speed dating Friday! Text STOP to unsubscribe';
    expect(smsLength(own).characters).toBe(own.length + optOut);
  });

  it('does not count the link twice when the admin already put it in', () => {
    const own = `Speed dating Friday! ${smsOptOutLine()}`;
    expect(smsLength(own).characters).toBe(own.length);
  });

  it('160 characters is one SMS, 161 is two', () => {
    expect(smsLength('a'.repeat(160 - optOut)).messages).toBe(1);
    expect(smsLength('a'.repeat(161 - optOut)).messages).toBe(2);
    expect(smsLength('a'.repeat(160 - optOut)).remaining).toBe(0);
  });

  it('long messages go in 153-character parts', () => {
    expect(smsLength('a'.repeat(306 - optOut)).messages).toBe(2);
    expect(smsLength('a'.repeat(307 - optOut)).messages).toBe(3);
  });

  it('one emoji or Word-style curly quote makes it Unicode — 70 per SMS', () => {
    const r = smsLength('It’s on Friday');
    expect(r.unicode).toBe(true);
    expect(r.messages).toBe(1);
    expect(smsLength('a'.repeat(71 - optOut - 1) + '😀').unicode).toBe(true);
  });

  it('€ and brackets cost two characters each', () => {
    expect(smsLength('€').characters).toBe(2 + optOut);
  });

  it('an empty message is nothing to send', () => {
    expect(smsLength('   ')).toMatchObject({ characters: 0, messages: 0 });
  });
});
