import { describe, it, expect } from 'vitest';
import { checkNewEvent, checkEventFields, checkEventEdit, eventNumbers, placesTyped, EVENT_NUMBER_FIELDS } from '@/lib/eventInput';

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
    expect(errorsOf(checkNewEvent({ ...good, maxMen: -1 }))).toEqual({ maxMen: 'Can’t be below 0.' });
    expect(errorsOf(checkNewEvent({ ...good, maxWomen: null }))).toEqual({ maxWomen: 'Please enter how many women can book.' });
    expect(errorsOf(checkNewEvent({ ...good, name: '  ' }))).toEqual({ name: 'Please give the event a name.' });
    expect(errorsOf(checkNewEvent({ ...good, venueId: '' }))).toEqual({ venueId: 'Please choose a venue.' });
    expect(errorsOf(checkNewEvent({ ...good, startsAt: '' }))).toEqual({ startsAt: 'Please enter a valid start date and time.' });
    expect(errorsOf(checkNewEvent({ ...good, cost: -1 }))).toEqual({ cost: 'The cost can’t be negative.' });
    expect(errorsOf(checkNewEvent({ ...good, repeat: { frequency: 'WEEKLY', interval: 1, endDate: '' } }))).toEqual({ 'repeat.endDate': 'Please choose an end date for the repeat.' });
  });

  it('a women-only or men-only night: one side at 0, with "Everyone" rating (Gil, 7 Oct)', () => {
    expect(checkNewEvent({ ...good, maxMen: 0, ratingAudience: 'EVERYONE' }).ok).toBe(true);
    // With "Opposite gender only", nobody would have anyone to rate.
    expect(errorsOf(checkNewEvent({ ...good, maxMen: 0 }))).toEqual({ ratingAudience: 'A women-only or men-only night needs “Everyone” here, so members have someone to rate.' });
    // Not both sides at 0.
    const both = errorsOf(checkNewEvent({ ...good, maxMen: 0, maxWomen: 0, ratingAudience: 'EVERYONE' }));
    expect(both.maxMen).toMatch(/At least one side needs places/);
    expect(both.maxWomen).toMatch(/At least one side needs places/);
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
    expect(errorsOf(checkEventEdit({ maxMen: null }, current))).toEqual({ maxMen: 'Please enter how many men can book.' });
  });

  it('a side set to 0 is checked against the event\'s own rating choice when that isn\'t being changed', () => {
    const asSaved = { ...current, maxMen: 12, maxWomen: 12, ratingAudience: 'OPPOSITE_GENDER' };
    expect(errorsOf(checkEventEdit({ maxMen: 0 }, asSaved))).toHaveProperty('ratingAudience');
    expect(checkEventEdit({ maxMen: 0, ratingAudience: 'EVERYONE' }, asSaved).ok).toBe(true);
    expect(checkEventEdit({ maxMen: 0 }, { ...asSaved, ratingAudience: 'EVERYONE' }).ok).toBe(true);
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

describe('typing 0 men or 0 women on the form (Gil, 7 Oct)', () => {
  const form = { maxMen: '12', maxWomen: '12', ratingAudience: 'OPPOSITE_GENDER' as const };

  it('switches the rating to "Everyone", and back when both sides have places again', () => {
    const one = placesTyped(form, 'maxMen', '0', null);
    expect(one.form).toEqual({ maxMen: '0', maxWomen: '12', ratingAudience: 'EVERYONE' });
    expect(one.switchedFrom).toBe('OPPOSITE_GENDER');
    // Both at 0 is refused when saving; the rating stays "Everyone" meanwhile.
    const both = placesTyped(one.form, 'maxWomen', '0', one.switchedFrom);
    expect(both.form.ratingAudience).toBe('EVERYONE');
    const women = placesTyped(both.form, 'maxWomen', '12', both.switchedFrom);
    expect(women.form.ratingAudience).toBe('EVERYONE'); // still no men
    const back = placesTyped(women.form, 'maxMen', '10', women.switchedFrom);
    expect(back.form).toEqual({ maxMen: '10', maxWomen: '12', ratingAudience: 'OPPOSITE_GENDER' });
    expect(back.switchedFrom).toBeNull();
    // An emptied box isn't 0: the switch is undone while it's being retyped.
    expect(placesTyped(one.form, 'maxMen', '', one.switchedFrom).form.ratingAudience).toBe('OPPOSITE_GENDER');
  });

  it('never undoes the admin\'s own "Everyone"', () => {
    const own = { maxMen: '0', maxWomen: '12', ratingAudience: 'EVERYONE' as const };
    expect(placesTyped(own, 'maxMen', '12', null).form.ratingAudience).toBe('EVERYONE');
    expect(placesTyped({ ...form, ratingAudience: 'EVERYONE' as const }, 'maxWomen', '0', null).switchedFrom).toBeNull();
  });

  it('treats 00 as 0, and other numbers as places', () => {
    expect(placesTyped(form, 'maxWomen', '00', null).form.ratingAudience).toBe('EVERYONE');
    expect(placesTyped(form, 'maxWomen', '20', null).form.ratingAudience).toBe('OPPOSITE_GENDER');
  });
});
