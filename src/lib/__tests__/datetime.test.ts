import { describe, it, expect } from 'vitest';
import { toDateTimeLocalValue, fromDateTimeLocalValue, formatEventWhen } from '@/lib/datetime';

/**
 * These guard the bug that made editing an event's EXPENSES text every
 * confirmed attendee that the event had been rescheduled.
 *
 * The old edit form filled its <input type="datetime-local"> with
 * `startsAt.slice(0, 16)` — the first 16 chars of a UTC ISO string, handed to
 * an input that reads them as LOCAL time. Saving re-parsed that as local and
 * stored a different instant, so "has startsAt changed?" was true on every
 * single save.
 */
describe('datetime-local round trip', () => {
  it('survives a round trip unchanged — the actual bug', () => {
    const stored = '2026-09-17T09:00:00.000Z';
    const roundTripped = fromDateTimeLocalValue(toDateTimeLocalValue(stored));
    expect(new Date(roundTripped).getTime()).toBe(new Date(stored).getTime());
  });

  it('is stable over repeated saves', () => {
    let v = '2026-09-17T09:00:00.000Z';
    for (let i = 0; i < 5; i++) v = fromDateTimeLocalValue(toDateTimeLocalValue(v));
    expect(new Date(v).toISOString()).toBe('2026-09-17T09:00:00.000Z');
  });

  it('shows the LOCAL clock in the input, not the UTC one', () => {
    // The old `.slice(0,16)` produced the UTC clock. Whatever the test
    // machine's timezone, the value must match local getters.
    const d = new Date('2026-09-17T09:00:00.000Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(toDateTimeLocalValue(d)).toBe(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  });

  it('demonstrates what the old slice(0,16) did wrong', () => {
    const stored = '2026-09-17T09:00:00.000Z';
    const oldWay = new Date(stored.slice(0, 16)).toISOString();
    const newWay = fromDateTimeLocalValue(toDateTimeLocalValue(stored));
    expect(newWay).toBe(stored);
    // Only differs where local time isn't UTC — true on the admin's machine
    // and on the Sydney droplet, which is what made this bite.
    if (new Date(stored).getTimezoneOffset() !== 0) expect(oldWay).not.toBe(stored);
  });

  it('returns empty string for an unparseable value rather than throwing', () => {
    expect(toDateTimeLocalValue('not a date')).toBe('');
  });
});

describe('formatEventWhen', () => {
  it('formats in the event timezone, not the server timezone', () => {
    // 09:00 UTC is 7:00pm in Sydney. A UTC server would otherwise text
    // attendees "9:00am" for a 7pm event.
    expect(formatEventWhen(new Date('2026-09-17T09:00:00.000Z'))).toBe('Thu 17 Sept 2026 at 7:00pm');
  });

  it('uses lowercase am/pm with no space', () => {
    expect(formatEventWhen(new Date('2026-09-17T02:30:00.000Z'))).toMatch(/at \d{1,2}:\d{2}(am|pm)$/);
  });
});
