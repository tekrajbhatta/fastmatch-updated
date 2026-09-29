/**
 * The Summary report builder — the old admin's "Categorise by / Group by /
 * Report type": one table with a row per category (bold, a subtotal) and,
 * under each, a row per group, plus a grand total.
 *
 * Pure: the API route fetches the facts; everything here is arithmetic, so it
 * can be tested without a database.
 */

export type Dimension = 'month' | 'ageGroup' | 'location' | 'venue' | 'event';
export type ReportType = 'all' | 'profitLoss';

export const CATEGORY_OPTIONS: { value: Dimension; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'ageGroup', label: 'Age Group' },
  { value: 'location', label: 'Location' },
  { value: 'venue', label: 'Venue' },
];
export const GROUP_OPTIONS: { value: Dimension | 'none'; label: string }[] = [
  { value: 'none', label: '(none)' },
  { value: 'location', label: 'Location' },
  { value: 'month', label: 'Month' },
  { value: 'ageGroup', label: 'Age Group' },
  { value: 'event', label: 'Individual Event' },
];
export const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'profitLoss', label: 'Basic Profit/Loss Statement' },
];

/** Age bands, by the member's age on the day (of the event, or of signing up). */
export const AGE_GROUPS: { label: string; min: number; max: number }[] = [
  { label: '18–25', min: 0, max: 25 },
  { label: '26–34', min: 26, max: 34 },
  { label: '35–44', min: 35, max: 44 },
  { label: '45–54', min: 45, max: 54 },
  { label: '55+', min: 55, max: 200 },
];
export function ageGroupOf(age: number): string {
  return (AGE_GROUPS.find((g) => age >= g.min && age <= g.max) ?? AGE_GROUPS[0]).label;
}

/** A bucket on one dimension: what to group by, what to show, how to sort. */
export interface Place { key: string; label: string; sort: string }

/** One paid booking. Every dimension is resolved already. */
export interface BookingFact {
  memberId: string;
  eventId: string;
  paid: number;
  /** null when the event's matches haven't been calculated yet. */
  matched: boolean | null;
  at: Record<Dimension, Place>;
}
/** One event, for its expenses (counted once per event, never per booking). */
export interface EventFact {
  eventId: string;
  expenses: number;
  at: Record<Exclude<Dimension, 'ageGroup'>, Place>;
}
/** One registration. Signups belong to a month, an age group and a location only. */
export interface SignupFact {
  at: Record<'month' | 'ageGroup' | 'location', Place>;
}

export interface Metrics {
  signups: number | null;
  members: number;
  bookings: number;
  /** % of attending members with at least one match — over events whose matches are in. null = none in yet. */
  matchPct: number | null;
  revenue: number;
  expenses: number | null;
  profit: number | null;
}
export interface Row { label: string; metrics: Metrics }
export interface CategoryRow extends Row { groups: Row[] }
export interface Report {
  columns: (keyof Metrics)[];
  categories: CategoryRow[];
  total: Metrics;
}

const SIGNUP_DIMENSIONS = new Set(['month', 'ageGroup', 'location', 'none']);

/**
 * Why a combination can't be produced, or null if it can. Kept here so the
 * page (to grey options out) and the API (to refuse) agree.
 */
export function reportProblem(opts: {
  category: Dimension; group: Dimension | 'none'; type: ReportType; memberFilters: boolean;
}): string | null {
  if (opts.category === opts.group) return 'Choose a different Group by — it’s the same as Categorise by.';
  if (opts.type === 'profitLoss') {
    if (opts.category === 'ageGroup' || opts.group === 'ageGroup') {
      return 'A profit/loss statement can’t be split by age group — an event’s expenses belong to the whole night, not to one age group.';
    }
    if (opts.memberFilters) {
      return 'A profit/loss statement can’t be restricted by age or gender — expenses are for the whole event. Clear those two filters.';
    }
  }
  return null;
}

/**
 * Signups can only be shown when every row is something a registration
 * belongs to (a month, an age group, a location) and nothing restricts the
 * report to particular venues or event types — a signup isn't tied to either.
 */
export function showsSignups(opts: { category: Dimension; group: Dimension | 'none'; type: ReportType; eventOnlyFilters: boolean }) {
  return opts.type === 'all' && SIGNUP_DIMENSIONS.has(opts.category) && SIGNUP_DIMENSIONS.has(opts.group) && !opts.eventOnlyFilters;
}

class Acc {
  signups = 0;
  bookings = 0;
  revenue = 0;
  expenses = 0;
  members = new Set<string>();
  calcMembers = new Set<string>();
  matchedMembers = new Set<string>();
  addBooking(b: BookingFact) {
    this.bookings++;
    this.revenue += b.paid;
    this.members.add(b.memberId);
    if (b.matched !== null) {
      this.calcMembers.add(b.memberId);
      if (b.matched) this.matchedMembers.add(b.memberId);
    }
  }
  metrics(withSignups: boolean, withMoney: boolean): Metrics {
    const r = (n: number) => Math.round(n * 100) / 100;
    return {
      signups: withSignups ? this.signups : null,
      members: this.members.size,
      bookings: this.bookings,
      matchPct: this.calcMembers.size ? r((this.matchedMembers.size / this.calcMembers.size) * 100) : null,
      revenue: r(this.revenue),
      expenses: withMoney ? r(this.expenses) : null,
      profit: withMoney ? r(this.revenue - this.expenses) : null,
    };
  }
}

export function buildReport(input: {
  category: Dimension;
  group: Dimension | 'none';
  type: ReportType;
  bookings: BookingFact[];
  events: EventFact[];
  signups: SignupFact[] | null; // null = not applicable to this report
}): Report {
  const { category, group, type } = input;
  const withSignups = input.signups !== null;
  const withMoney = type === 'profitLoss';

  const cats = new Map<string, { place: Place; acc: Acc; groups: Map<string, { place: Place; acc: Acc }> }>();
  const total = new Acc();

  const slot = (catPlace: Place, groupPlace: Place | null) => {
    let c = cats.get(catPlace.key);
    if (!c) cats.set(catPlace.key, (c = { place: catPlace, acc: new Acc(), groups: new Map() }));
    let g: { place: Place; acc: Acc } | undefined;
    if (groupPlace) {
      g = c.groups.get(groupPlace.key);
      if (!g) c.groups.set(groupPlace.key, (g = { place: groupPlace, acc: new Acc() }));
    }
    return [c.acc, g?.acc].filter((a): a is Acc => !!a);
  };

  // Age groups are a fixed set: show every band, even empty ones, so tables
  // line up across months or locations (as the old report did).
  const ageBands = AGE_GROUPS.map((g, i) => ({ key: g.label, label: g.label, sort: String(i) }));

  for (const b of input.bookings) {
    const accs = slot(b.at[category], group === 'none' ? null : b.at[group]);
    for (const a of [...accs, total]) a.addBooking(b);
  }
  if (withMoney) {
    for (const e of input.events) {
      const cat = e.at[category as Exclude<Dimension, 'ageGroup'>];
      const grp = group === 'none' ? null : e.at[group as Exclude<Dimension, 'ageGroup'>];
      for (const a of [...slot(cat, grp), total]) a.expenses += e.expenses;
    }
  }
  if (input.signups) {
    for (const s of input.signups) {
      const cat = s.at[category as 'month' | 'ageGroup' | 'location'];
      const grp = group === 'none' ? null : s.at[group as 'month' | 'ageGroup' | 'location'];
      for (const a of [...slot(cat, grp), total]) a.signups++;
    }
  }

  if (category === 'ageGroup') for (const band of ageBands) slot(band, null);
  if (group === 'ageGroup') for (const c of cats.values()) for (const band of ageBands) slot(c.place, band);

  const bySort = <T extends { place: Place }>(a: T, b: T) => a.place.sort.localeCompare(b.place.sort);
  const categories = [...cats.values()].sort(bySort).map((c) => ({
    label: c.place.label,
    metrics: c.acc.metrics(withSignups, withMoney),
    groups: [...c.groups.values()].sort(bySort).map((g) => ({ label: g.place.label, metrics: g.acc.metrics(withSignups, withMoney) })),
  }));

  const columns: (keyof Metrics)[] =
    type === 'profitLoss'
      ? ['bookings', 'revenue', 'expenses', 'profit']
      : [...(withSignups ? (['signups'] as const) : []), 'members', 'bookings', 'matchPct', 'revenue'];

  return { columns, categories, total: total.metrics(withSignups, withMoney) };
}
