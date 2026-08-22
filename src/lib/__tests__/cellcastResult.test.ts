import { describe, it, expect } from 'vitest';
import { parseCellcastResult, toCellcastNumber } from '../sms/send';

// Fixtures below are Cellcast's OWN documented responses, copied from
// https://developer.cellcast.com/api-docs/bulk-sms.html — not invented shapes.
// Note the details that are easy to get wrong and that silently hide every
// rejection if missed:
//   - `status` is a BOOLEAN (true/false), not a string
//   - buckets are camelCase: invalidContacts / unsubscribeContacts
//   - entries use a capitalised `Contact` key, with `Error` / `ErrorType`
//   - `unsubscribeContacts` holds plain strings, not objects
//   - Cellcast echoes numbers WITHOUT the leading 0 or country code
//     ("400000000" for what we sent as "0400000000")

const RECIPIENTS = ['0400000000', '0400000001', '0400000002', '0400000003'];

/** The documented 200 response, trimmed to the fields the parser reads. */
const DOC_SUCCESS = {
  status: true,
  message: 'Request is being processed',
  data: {
    queueResponse: [
      { Contact: '400000000', MessageId: '675161d8a000000000000000', Result: 'Message added to queue.' },
      { Contact: '400000001', MessageId: '675161d8a000000000000001', Result: 'Message added to queue.' },
      { Contact: '400000002', MessageId: '675161d8a000000000000002', Result: 'Message added to queue.' },
    ],
    message: 'success register all valid contacts to queue',
    invalidContacts: [],
    unsubscribeContacts: ['400000003'],
    totalValidContact: 3,
    totalInvalidContact: 0,
    totalUnsubscribeContact: 1,
  },
  error: {},
};

describe('parseCellcastResult', () => {
  it('parses the documented success response: 3 queued, 1 unsubscribed', () => {
    const r = parseCellcastResult(DOC_SUCCESS, RECIPIENTS);
    expect(r.sent).toBe(3);
    expect(r.failed).toEqual([{ to: '0400000003', reason: 'unsubscribed' }]);
  });

  it('reports invalid contacts with Cellcast\'s own error wording', () => {
    const r = parseCellcastResult(
      {
        status: true,
        data: {
          queueResponse: [{ Contact: '400000000', MessageId: 'x', Result: 'Message added to queue.' }],
          invalidContacts: [
            { Contact: '400000001', Error: 'Number is less than 9 digit', ErrorType: 'less_nine_digit' },
            { Contact: '400000002', Error: 'Number is not valid', ErrorType: 'number_not_valid' },
          ],
          unsubscribeContacts: [],
        },
      },
      RECIPIENTS
    );
    expect(r.sent).toBe(1);
    expect(r.failed).toEqual([
      { to: '0400000001', reason: 'Number is less than 9 digit' },
      { to: '0400000002', reason: 'Number is not valid' },
    ]);
  });

  it('matches numbers echoed without the leading 0 or country code', () => {
    // We send 0400000000; Cellcast echoes 400000000.
    const r = parseCellcastResult(
      { status: true, data: { queueResponse: [], invalidContacts: [{ Contact: '400000000', Error: 'Number is not valid' }] } },
      RECIPIENTS
    );
    expect(r.failed[0].to).toBe('0400000000');
  });

  it('treats status:false as a whole-request failure (boolean, not a string)', () => {
    // This is the shape that a string-based check would miss entirely.
    const r = parseCellcastResult(
      {
        status: false,
        message: 'Your balance is too low for this request, please recharge.',
        data: {},
        error: { errorMessage: 'Your balance is too low for this request, please recharge.' },
      },
      RECIPIENTS
    );
    expect(r.sent).toBe(0);
    expect(r.failed).toHaveLength(4);
    expect(r.failed[0].reason).toBe('Your balance is too low for this request, please recharge.');
  });

  it('treats a {code, message} error envelope as a whole-request failure', () => {
    const r = parseCellcastResult({ code: 401, message: 'Token expired', stack: 'APIError: Token expired ....' }, RECIPIENTS);
    expect(r.sent).toBe(0);
    expect(r.failed[0].reason).toBe('Token expired');
  });

  it('does not double-count a number appearing in both buckets', () => {
    const r = parseCellcastResult(
      {
        status: true,
        data: {
          queueResponse: [],
          invalidContacts: [{ Contact: '400000003', Error: 'Number is not valid' }],
          unsubscribeContacts: ['400000003'],
        },
      },
      RECIPIENTS
    );
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].reason).toBe('Number is not valid');
  });

  it('trusts queueResponse as the authoritative sent count', () => {
    // Only 2 queued, nothing rejected — the 2 unaccounted-for recipients must
    // NOT be reported as sent.
    const r = parseCellcastResult(
      {
        status: true,
        data: {
          queueResponse: [{ Contact: '400000000' }, { Contact: '400000001' }],
          invalidContacts: [],
          unsubscribeContacts: [],
        },
      },
      RECIPIENTS
    );
    expect(r.sent).toBe(2);
  });

  it('falls back to recipients-minus-failures when queueResponse is absent', () => {
    const r = parseCellcastResult({ status: true, data: {} }, RECIPIENTS);
    expect(r.sent).toBe(4);
    expect(r.failed).toEqual([]);
  });
});

describe('toCellcastNumber', () => {
  it('converts the 0-prefixed form members actually type', () => {
    expect(toCellcastNumber('0412345678')).toBe('61412345678');
  });

  it('strips spaces and punctuation', () => {
    expect(toCellcastNumber('0412 345 678')).toBe('61412345678');
    expect(toCellcastNumber('+61 412 345 678')).toBe('61412345678');
  });

  it('leaves an already-correct 61 number alone', () => {
    expect(toCellcastNumber('61412345678')).toBe('61412345678');
  });

  it('adds the country code to the 9-digit form', () => {
    expect(toCellcastNumber('412345678')).toBe('61412345678');
  });

  it('passes anything unrecognised through untouched, so Cellcast reports why', () => {
    expect(toCellcastNumber('123')).toBe('123');
    expect(toCellcastNumber('+6540000000000')).toBe('+6540000000000');
  });
});
