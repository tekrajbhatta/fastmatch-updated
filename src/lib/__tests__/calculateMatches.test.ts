import { describe, it, expect } from 'vitest';
import { resolveMatch } from '../calculateMatches';

// This is the single most consequential piece of business logic in the app
// — it decides who gets whose contact details. Explicitly confirmed rules
// (see spec doc / decisions log):
//   Date + Date       -> DATE match
//   Date + Friend      -> FRIEND match
//   Friend + Friend    -> FRIEND match
//   Anything with a NO -> no match
describe('resolveMatch', () => {
  it('mutual Date is a Date match', () => {
    expect(resolveMatch('DATE', 'DATE')).toBe('DATE');
  });

  it('one Date + one Friend is a Friend match, either order', () => {
    expect(resolveMatch('DATE', 'FRIEND')).toBe('FRIEND');
    expect(resolveMatch('FRIEND', 'DATE')).toBe('FRIEND');
  });

  it('mutual Friend is a Friend match', () => {
    expect(resolveMatch('FRIEND', 'FRIEND')).toBe('FRIEND');
  });

  it('a No on either side is never a match', () => {
    expect(resolveMatch('NO', 'DATE')).toBeNull();
    expect(resolveMatch('DATE', 'NO')).toBeNull();
    expect(resolveMatch('NO', 'FRIEND')).toBeNull();
    expect(resolveMatch('FRIEND', 'NO')).toBeNull();
    expect(resolveMatch('NO', 'NO')).toBeNull();
  });
});
