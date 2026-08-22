import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSmsBulk } from '@/lib/sms/send';

/**
 * Regression guard for the sender ID.
 *
 * Cellcast rejects the ENTIRE request with HTTP 400 ("Your sender id is not
 * registered.") when it doesn't recognise the value — it does not fall back to
 * a shared number. So a default like 'FastMatch' that was never registered in
 * the Cellcast dashboard breaks every single SMS in the app, and does it
 * invisibly: registration 500s with a generic error and no message is sent.
 *
 * The contract these tests lock in: blank, whitespace or unset means OMIT the
 * field entirely (Cellcast then uses its shared number pool, which always
 * works). Only an explicitly configured value is ever sent.
 */

const OK_RESPONSE = JSON.stringify({
  status: true,
  message: 'Request is being processed',
  data: { queueResponse: [{ Contact: '400000000', MessageId: 'x', Result: 'Message added to queue.' }], totalValidContact: 1 },
  error: {},
});

function captureRequest() {
  const spy = vi.fn(async (_url: string, _init: RequestInit) => new Response(OK_RESPONSE, { status: 200 }));
  vi.stubGlobal('fetch', spy);
  return () => JSON.parse(spy.mock.calls[0][1].body as string);
}

describe('Cellcast sender ID', () => {
  const original = process.env.CELLCAST_SENDER_ID;

  beforeEach(() => {
    process.env.CELLCAST_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original === undefined) delete process.env.CELLCAST_SENDER_ID;
    else process.env.CELLCAST_SENDER_ID = original;
  });

  it('omits sender when CELLCAST_SENDER_ID is an empty string', async () => {
    process.env.CELLCAST_SENDER_ID = '';
    const body = captureRequest();
    await sendSmsBulk({ to: ['0400000000'], body: 'hi' });
    expect(body()).not.toHaveProperty('sender');
  });

  it('omits sender when CELLCAST_SENDER_ID is unset', async () => {
    delete process.env.CELLCAST_SENDER_ID;
    const body = captureRequest();
    await sendSmsBulk({ to: ['0400000000'], body: 'hi' });
    expect(body()).not.toHaveProperty('sender');
  });

  it('omits sender when CELLCAST_SENDER_ID is only whitespace', async () => {
    process.env.CELLCAST_SENDER_ID = '   ';
    const body = captureRequest();
    await sendSmsBulk({ to: ['0400000000'], body: 'hi' });
    expect(body()).not.toHaveProperty('sender');
  });

  it('sends sender when a registered id is explicitly configured', async () => {
    process.env.CELLCAST_SENDER_ID = 'FastMatch';
    const body = captureRequest();
    await sendSmsBulk({ to: ['0400000000'], body: 'hi' });
    expect(body().sender).toBe('FastMatch');
  });

  // 0491 570 006 is reserved by ACMA for use in fiction — safe to hard-code
  // in a test without dialling a real person.
  it('still normalises contacts to 61XXXXXXXXX regardless of sender', async () => {
    process.env.CELLCAST_SENDER_ID = '';
    const body = captureRequest();
    await sendSmsBulk({ to: ['0491570006'], body: 'hi' });
    expect(body().contacts).toEqual(['61491570006']);
  });
});
