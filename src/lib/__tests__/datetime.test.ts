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
  const SYD = 'Australia/Sydney';

  it('survives a round trip unchanged — the actual bug', () => {
    const stored = '2026-09-17T09:00:00.000Z';
    const roundTripped = fromDateTimeLocalValue(toDateTimeLocalValue(stored, SYD), SYD);
    expect(new Date(roundTripped).getTime()).toBe(new Date(stored).getTime());
  });

  it('is stable over repeated saves', () => {
    let v = '2026-09-17T09:00:00.000Z';
    for (let i = 0; i < 5; i++) v = fromDateTimeLocalValue(toDateTimeLocalValue(v, SYD), SYD);
    expect(new Date(v).toISOString()).toBe('2026-09-17T09:00:00.000Z');
  });

  it("shows the EVENT CITY's clock in the input, not the device's or UTC's", () => {
    // Whatever the machine's timezone: 09:00 UTC is 7 pm in Sydney, 5 pm in Perth.
    expect(toDateTimeLocalValue('2026-09-17T09:00:00.000Z', SYD)).toBe('2026-09-17T19:00');
    expect(toDateTimeLocalValue('2026-09-17T09:00:00.000Z', 'Australia/Perth')).toBe('2026-09-17T17:00');
  });

  it('saves what was typed on the event city’s clock: 7 pm in Perth is 7 pm in Perth', () => {
    expect(fromDateTimeLocalValue('2026-11-13T19:00', 'Australia/Perth')).toBe('2026-11-13T11:00:00.000Z');
    expect(fromDateTimeLocalValue('2026-11-13T19:00', SYD)).toBe('2026-11-13T08:00:00.000Z');
  });

  it('demonstrates what the old slice(0,16) did wrong', () => {
    const stored = '2026-09-17T09:00:00.000Z';
    const oldWay = new Date(stored.slice(0, 16)).toISOString();
    const newWay = fromDateTimeLocalValue(toDateTimeLocalValue(stored, SYD), SYD);
    expect(newWay).toBe(stored);
    // Only differs where local time isn't UTC — true on the admin's machine
    // and on the Sydney droplet, which is what made this bite.
    if (new Date(stored).getTimezoneOffset() !== 0) expect(oldWay).not.toBe(stored);
  });

  it('returns empty string for an unparseable value rather than throwing', () => {
    expect(toDateTimeLocalValue('not a date', SYD)).toBe('');
    expect(fromDateTimeLocalValue('', SYD)).toBe('');
    expect(fromDateTimeLocalValue('2026-02-30T19:00', SYD)).toBe('');
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
