import { describe, it, expect } from 'vitest';
import { buildReport, reportProblem, showsSignups, ageGroupOf, type BookingFact, type EventFact, type Place } from '@/lib/reports/breakdown';

const P = (key: string, sort = key): Place => ({ key, label: key, sort });
const at = (month: string, age: string, location: string, venue: string, event: string) => ({
  month: P(month), ageGroup: P(age, String(['18–25', '26–34', '35–44', '45–54', '55+'].indexOf(age))),
  location: P(location), venue: P(venue), event: P(event),
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
