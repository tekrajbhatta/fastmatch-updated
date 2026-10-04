import { describe, it, expect } from 'vitest';
import { blastContentProblem } from '../campaigns/fields';
import { boxesFromSavedFilter, filterWithBoxes, otherSavedFilterParts } from '../campaigns/sendTabFilter';
import { recipientFilter } from '../campaigns/audience';
import { buildMemberWhere } from '../memberFilter';

/**
 * Blasts: no empty email subject or SMS message (save and send), and the
 * Send tab working from — and saving back into — the blast's saved audience.
 */
describe('blastContentProblem', () => {
  const ok = { sendEmail: true, sendSms: true, subject: 'Speed dating Friday', smsBody: 'See you Friday' };

  it('passes a blast with a subject and a message', () => {
    expect(blastContentProblem(ok)).toBeNull();
  });

  it('needs a subject when Send Email is on — blank or spaces', () => {
    expect(blastContentProblem({ ...ok, subject: '' })).toBe('no-subject');
    expect(blastContentProblem({ ...ok, subject: '   ' })).toBe('no-subject');
    expect(blastContentProblem({ ...ok, subject: null })).toBe('no-subject');
    expect(blastContentProblem({ ...ok, sendEmail: false, subject: '' })).toBeNull();
  });

  it('needs a message when Send SMS is on', () => {
    expect(blastContentProblem({ ...ok, smsBody: '' })).toBe('no-sms-message');
    expect(blastContentProblem({ ...ok, smsBody: ' \n ' })).toBe('no-sms-message');
    expect(blastContentProblem({ ...ok, sendSms: false, smsBody: null })).toBeNull();
  });

  it('needs at least one channel', () => {
    expect(blastContentProblem({ ...ok, sendEmail: false, sendSms: false })).toBe('no-channel');
  });
});

describe('the Send tab and the saved filter', () => {
  const saved = { ageMin: 28, ageMax: 40, gender: 'FEMALE', cityId: 'syd', contactMethods: ['SMS', 'EMAIL_AND_SMS'], search: 'gil' };

  it('opens with the saved filter filled in', () => {
    expect(boxesFromSavedFilter(saved)).toEqual({
      ageMin: '28', ageMax: '40', gender: 'FEMALE', cityId: 'syd', contactMethods: ['EMAIL_AND_SMS', 'SMS'],
    });
  });

  it('opens empty for a blast with no saved filter, or a damaged one', () => {
    const empty = { ageMin: '', ageMax: '', gender: '', cityId: '', contactMethods: [] };
    expect(boxesFromSavedFilter(null)).toEqual(empty);
    expect(boxesFromSavedFilter({})).toEqual(empty);
    expect(boxesFromSavedFilter({ gender: 'X', contactMethods: 'SMS', ageMin: 'abc' })).toEqual(empty);
  });

  it('saving back changes only its own boxes and keeps the Members-list search', () => {
    const boxes = { ...boxesFromSavedFilter(saved), ageMin: '', gender: '' as const, contactMethods: ['EMAIL' as const] };
    expect(filterWithBoxes(saved, boxes)).toEqual({ ageMax: 40, cityId: 'syd', contactMethods: ['EMAIL'], search: 'gil' });
  });

  it('round-trips unchanged when nothing is touched', () => {
    expect(filterWithBoxes(saved, boxesFromSavedFilter(saved))).toEqual({
      ...saved, contactMethods: ['EMAIL_AND_SMS', 'SMS'],
    });
  });

  it('says what else the saved filter limits the blast to', () => {
    expect(otherSavedFilterParts(saved)).toEqual([{ key: 'search', label: 'Name, email or mobile contains “gil”' }]);
    expect(otherSavedFilterParts({ ageMin: 20 })).toEqual([]);
  });

  it('a ticked contact method limits who the blast reaches', () => {
    const blast = { sendEmail: true, sendSms: true, ignorePreference: false };
    const where = buildMemberWhere(recipientFilter(filterWithBoxes({}, { ...boxesFromSavedFilter({}), contactMethods: ['SMS'] }) as any, blast));
    expect(where.contactMethod).toEqual({ in: ['SMS'] });
    // …on top of each member's own preference, not instead of it.
    expect(where.AND).toBeDefined();
    expect(buildMemberWhere(recipientFilter({}, blast)).contactMethod).toBeUndefined();
  });
});
