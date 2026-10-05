import { describe, it, expect } from 'vitest';
import { buildReport, buildOverview, shareMatched, reportProblem, showsSignups, ageGroupOf, type BookingFact, type EventFact, type Place, type SignupFact } from '@/lib/reports/breakdown';

const P = (key: string, sort = key): Place => ({ key, label: key, sort });
const at = (month: string, age: string, location: string, venue: string, event: string, theme = 'Speed Dating') => ({
  month: P(month), ageGroup: P(age, String(['18–25', '26–34', '35–44', '45–54', '55+'].indexOf(age))),
  location: P(location), venue: P(venue), event: P(event), theme: P(theme),
});
const booking = (memberId: string, eventId: string, paid: number, month: string, age: string, matched: boolean | null = null): BookingFact => ({
  memberId, eventId, paid, matched, at: at(month, age, 'Sydney', `venue-${eventId}`, eventId),
});
const eventFact = (eventId: string, month: string, expenses: number): EventFact => {
  const { ageGroup, ...rest } = at(month, '26–34', 'Sydney', `venue-${eventId}`, eventId);
  return { eventId, expenses, at: rest };
};

describe('buildReport — All', () => {
  const bookings = [
    booking('ann', 'e1', 49, '2026-08', '26–34', true),
    booking('bob', 'e1', 49, '2026-08', '35–44', false),
    booking('cat', 'e2', 45, '2026-09', '26–34', null), // results not in yet
    booking('ann', 'e2', 45, '2026-09', '26–34', null),
  ];

  it('category rows are subtotals, groups underneath, and a grand total', () => {
    const r = buildReport({ category: 'month', group: 'ageGroup', type: 'all', bookings, events: [], signups: null });
    expect(r.categories.map((c) => c.label)).toEqual(['2026-08', '2026-09']);
    expect(r.categories[0].metrics).toMatchObject({ members: 2, bookings: 2, revenue: 98 });
    expect(r.total).toMatchObject({ members: 3, bookings: 4, revenue: 188 });
  });

  it('every age band is listed under each category, empty ones as zero', () => {
    const r = buildReport({ category: 'month', group: 'ageGroup', type: 'all', bookings, events: [], signups: null });
    expect(r.categories[0].groups.map((g) => g.label)).toEqual(['18–25', '26–34', '35–44', '45–54', '55+']);
    expect(r.categories[0].groups[0].metrics.bookings).toBe(0);
  });

  it('match % is over members at events whose results are in, and null where none are', () => {
    const r = buildReport({ category: 'month', group: 'none', type: 'all', bookings, events: [], signups: null });
    expect(r.categories[0].metrics.matchPct).toBe(50); // ann matched, bob didn't
    expect(r.categories[1].metrics.matchPct).toBeNull(); // September not calculated yet
    expect(r.total.matchPct).toBe(50);
  });

  it('members are counted once however many bookings they have', () => {
    const r = buildReport({ category: 'location', group: 'none', type: 'all', bookings, events: [], signups: null });
    expect(r.total.members).toBe(3);
    expect(r.total.bookings).toBe(4);
  });

  it('signups column only when asked for', () => {
    const withS = buildReport({ category: 'month', group: 'none', type: 'all', bookings, events: [], signups: [{ at: { month: P('2026-08'), ageGroup: P('26–34', '1'), location: P('Sydney') } }] });
    expect(withS.columns[0]).toBe('signups');
    expect(withS.categories[0].metrics.signups).toBe(1);
    expect(buildReport({ category: 'month', group: 'none', type: 'all', bookings, events: [], signups: null }).columns).not.toContain('signups');
  });
});

describe('buildReport — Basic Profit/Loss', () => {
  it('expenses are counted once per event, not once per booking; a night with no bookings still costs', () => {
    const r = buildReport({
      category: 'month', group: 'event', type: 'profitLoss',
      bookings: [booking('a', 'e1', 49, '2026-08', '26–34'), booking('b', 'e1', 49, '2026-08', '26–34'), booking('c', 'e1', 49, '2026-08', '26–34')],
      events: [eventFact('e1', '2026-08', 100), eventFact('e3', '2026-08', 60)],
      signups: null,
    });
    expect(r.columns).toEqual(['bookings', 'revenue', 'expenses', 'profit']);
    expect(r.categories[0].metrics).toMatchObject({ revenue: 147, expenses: 160, profit: -13 });
    const e1 = r.categories[0].groups.find((g) => g.label === 'e1')!;
    expect(e1.metrics).toMatchObject({ revenue: 147, expenses: 100, profit: 47 });
    expect(r.categories[0].groups.find((g) => g.label === 'e3')!.metrics).toMatchObject({ bookings: 0, revenue: 0, profit: -60 });
    expect(r.total.profit).toBe(-13);
  });
});

describe('which reports make sense', () => {
  it('refuses the same thing twice, and P/L by age group or with age/gender filters', () => {
    expect(reportProblem({ category: 'month', group: 'month', type: 'all', memberFilters: false })).toMatch(/same/);
    expect(reportProblem({ category: 'ageGroup', group: 'none', type: 'profitLoss', memberFilters: false })).toMatch(/age group/);
    expect(reportProblem({ category: 'month', group: 'none', type: 'profitLoss', memberFilters: true })).toMatch(/age or gender/);
    expect(reportProblem({ category: 'month', group: 'ageGroup', type: 'all', memberFilters: true })).toBeNull();
  });

  it('signups only for month / age group / location, with no venue or event-type filter', () => {
    expect(showsSignups({ category: 'month', group: 'ageGroup', type: 'all', eventOnlyFilters: false })).toBe(true);
    expect(showsSignups({ category: 'venue', group: 'none', type: 'all', eventOnlyFilters: false })).toBe(false);
    expect(showsSignups({ category: 'month', group: 'event', type: 'all', eventOnlyFilters: false })).toBe(false);
    expect(showsSignups({ category: 'month', group: 'none', type: 'all', eventOnlyFilters: true })).toBe(false);
    expect(showsSignups({ category: 'month', group: 'none', type: 'profitLoss', eventOnlyFilters: false })).toBe(false);
  });

  it('age bands', () => {
    expect([18, 25, 26, 34, 35, 44, 45, 54, 55, 70].map(ageGroupOf)).toEqual(['18–25', '18–25', '26–34', '26–34', '35–44', '35–44', '45–54', '45–54', '55+', '55+']);
  });
});

describe('the Overview agrees with the table', () => {
  // Ann matched at both events, Bob at none; e2's results aren't in yet.
  const bookings = [
    booking('ann', 'e1', 49, '2026-08', '26–34', true),
    booking('bob', 'e1', 49, '2026-08', '35–44', false),
    booking('ann', 'e3', 45, '2026-08', '26–34', true),
    booking('cat', 'e2', 0, '2026-09', '26–34', null),
  ];
  const events = [eventFact('e1', '2026-08', 100), eventFact('e2', '2026-09', 50), eventFact('e3', '2026-08', 30), eventFact('e4', '2026-09', 20)];
  const signups: SignupFact[] = [
    { at: { month: P('2026-08'), ageGroup: P('26–34'), location: P('Sydney') } },
    { at: { month: P('2026-09'), ageGroup: P('26–34'), location: P('Sydney') } },
    { at: { month: P('2026-09'), ageGroup: P('35–44'), location: P('Sydney') } },
  ];

  it('has the same totals as the profit/loss statement and the All report', () => {
    const o = buildOverview({ bookings, events, signups, memberFilters: false });
    const pl = buildReport({ category: 'month', group: 'none', type: 'profitLoss', bookings, events, signups: null }).total;
    const all = buildReport({ category: 'location', group: 'none', type: 'all', bookings, events, signups: null }).total;
    expect(o.totals).toEqual({ attendees: pl.bookings, revenue: pl.revenue, expenses: pl.expenses, profit: pl.profit, matchRate: all.matchPct });
    // Every event's expenses once, even e4 with nobody booked.
    expect(o.totals.expenses).toBe(200);
  });

  it('counts each person once for the match rate, so it can’t pass 100%', () => {
    // Ann (matched twice) and Bob: 1 of 2 people, not "4 match-ends over 3 bookings".
    expect(buildOverview({ bookings, events, signups, memberFilters: false }).totals.matchRate).toBe(50);
  });

  it('leaves expenses and profit out when restricted by age or gender', () => {
    const o = buildOverview({ bookings, events, signups, memberFilters: true });
    expect([o.totals.expenses, o.totals.profit, o.byCity[0].expenses]).toEqual([null, null, null]);
  });

  it('shows revenue by event month, and signups by the month they joined', () => {
    const o = buildOverview({ bookings, events, signups, memberFilters: false });
    expect(o.revenueOverTime).toEqual([{ month: '2026-08', revenue: 143 }, { month: '2026-09', revenue: 0 }]);
    expect(o.memberGrowth).toEqual([{ month: '2026-08', count: 1 }, { month: '2026-09', count: 2 }]);
    expect(buildOverview({ bookings, events, signups: null, memberFilters: false }).memberGrowth).toBeNull();
  });

  it('splits by event type', () => {
    expect(buildOverview({ bookings, events, signups, memberFilters: false }).byTheme.map((r) => [r.name, r.attendees])).toEqual([['Speed Dating', 4]]);
  });
});

describe('shareMatched (one event’s match rate)', () => {
  it('is the share of attendees with at least one match', () => {
    const pairs = [{ memberAId: 'a', memberBId: 'b' }, { memberAId: 'a', memberBId: 'c' }, { memberAId: 'a', memberBId: 'd' }];
    // a, b, c, d matched; e didn't: 4 of 5. Pairs × 2 used to give 6 of 5 = 120%.
    expect(shareMatched(['a', 'b', 'c', 'd', 'e'], pairs)).toBe(80);
    expect(shareMatched(['a', 'b', 'c'], [{ memberAId: 'a', memberBId: 'b' }])).toBe(66.67);
    expect(shareMatched([], [])).toBe(0);
  });
});

