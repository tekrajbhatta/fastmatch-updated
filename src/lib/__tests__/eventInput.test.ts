import { describe, it, expect } from 'vitest';
import { checkNewEvent, checkEventFields, checkEventEdit, eventNumbers, EVENT_NUMBER_FIELDS } from '@/lib/eventInput';

/** One set of rules for New event and Edit event, each problem against its field. */
const good = {
  themeId: 't1', name: '28-40 years', description: '', photoUrl: '', startsAt: '2026-11-06T08:30:00.000Z',
  cityId: 'c1', venueId: 'v1', ageMin: 28, ageMax: 40, cost: 49.5, maxMen: 12, maxWomen: 12, expenses: null,
  visibility: 'PUBLIC', confirmed: false, fastmatchDiscounts: true, groupDiscounts: true,
};
const errorsOf = (r: { ok: true } | { ok: false; fieldErrors: Record<string, string> }) => (r.ok ? {} : r.fieldErrors);

describe('a new event', () => {
  it('passes with every field filled in, blanks becoming nothing', () => {
    const r = checkNewEvent(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect([r.data.description, r.data.photoUrl, r.data.expenses]).toEqual([null, null, null]);
  });

  it('says which field is wrong', () => {
    expect(errorsOf(checkNewEvent({ ...good, maxMen: 0 }))).toEqual({ maxMen: 'At least 1.' });
    expect(errorsOf(checkNewEvent({ ...good, maxWomen: null }))).toEqual({ maxWomen: 'Please enter how many women can book.' });
    expect(errorsOf(checkNewEvent({ ...good, name: '  ' }))).toEqual({ name: 'Please give the event a name.' });
    expect(errorsOf(checkNewEvent({ ...good, venueId: '' }))).toEqual({ venueId: 'Please choose a venue.' });
    expect(errorsOf(checkNewEvent({ ...good, startsAt: '' }))).toEqual({ startsAt: 'Please enter a valid start date and time.' });
    expect(errorsOf(checkNewEvent({ ...good, cost: -1 }))).toEqual({ cost: 'The cost can’t be negative.' });
    expect(errorsOf(checkNewEvent({ ...good, repeat: { frequency: 'WEEKLY', interval: 1, endDate: '' } }))).toEqual({ 'repeat.endDate': 'Please choose an end date for the repeat.' });
  });

  it('won’t have a minimum age above the maximum', () => {
    expect(errorsOf(checkNewEvent({ ...good, ageMin: 45, ageMax: 40 }))).toEqual({ ageMin: 'The minimum age can’t be higher than the maximum.' });
    expect(checkNewEvent({ ...good, ageMin: 40, ageMax: 40 }).ok).toBe(true);
  });

  it('reports every problem at once, not one at a time', () => {
    expect(errorsOf(checkNewEvent({ ...good, maxMen: null, ageMin: 45 }))).toEqual({
      maxMen: 'Please enter how many men can book.',
      ageMin: 'The minimum age can’t be higher than the maximum.',
    });
  });
});

describe('editing an event', () => {
  const current = { ageMin: 28, ageMax: 40 };

  it('checks the whole form the same way as New event', () => {
    expect(errorsOf(checkEventFields({ ...good, maxMen: null }))).toEqual({ maxMen: 'Please enter how many men can book.' });
  });

  it('an empty maximum is refused instead of saving 0', () => {
    expect(errorsOf(checkEventEdit({ maxMen: 0 }, current))).toEqual({ maxMen: 'At least 1.' });
  });

  it('checks the ages against the ones not being changed', () => {
    expect(errorsOf(checkEventEdit({ ageMin: 45 }, current))).toEqual({ ageMin: 'The minimum age can’t be higher than the maximum.' });
    expect(checkEventEdit({ ageMax: 50 }, current).ok).toBe(true);
  });

  it('an empty expenses box clears the figure', () => {
    const r = checkEventEdit({ expenses: null }, current);
    expect(r.ok && r.data.expenses).toBeNull();
  });

  it('leaves out what isn’t sent, and anything that isn’t an event detail', () => {
    const r = checkEventEdit({ cost: 45, status: 'CANCELLED', matchesCalculated: true, draft: false }, current);
    expect(r.ok && r.data).toEqual({ cost: 45, draft: false });
  });
});

describe('the form’s number boxes', () => {
  it('are numbers, or null when empty', () => {
    expect(eventNumbers({ ageMin: '28', ageMax: '', cost: '49.50', maxMen: 12, maxWomen: ' ', expenses: '' }, [...EVENT_NUMBER_FIELDS]))
      .toEqual({ ageMin: 28, ageMax: null, cost: 49.5, maxMen: 12, maxWomen: null, expenses: null });
  });
});
