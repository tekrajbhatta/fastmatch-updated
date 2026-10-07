'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Field, Input, Select, Button, Card, Loader } from '@/components/ui';
import { timeZoneForCity } from '@/lib/timezone';
import {
  CATEGORY_OPTIONS, GROUP_OPTIONS, REPORT_TYPES, reportProblem,
  type Dimension, type ReportType, type Metrics, type CategoryRow, type Overview, type OverviewRow,
} from '@/lib/reports/breakdown';

interface Theme { id: string; name: string; }
interface City { id: string; name: string; }
interface Venue { id: string; name: string; city: { id: string; name: string } }
interface EventOption {
  id: string; number: number; name: string; startsAt: string; status: string; venue: { name: string; address: string | null }; ageMin: number; ageMax: number;
  theme: { name: string }; city: { name: string };
}
interface Breakdown { columns: (keyof Metrics)[]; categories: CategoryRow[]; total: Metrics; signupsHidden: boolean }

interface StatementLine { id: string; badge: number; name: string; method: string; discountCode: string | null; amount: number }
interface EventReport {
  event: { id: string; number: number; name: string; startsAt: string; venue: string; city: string; theme: string };
  /** False for an event still to come: every figure is 0 until it has happened. */
  happened: boolean;
  attended: number; men: number; women: number; matchRate: number | null;
  revenue: number; expenses: number; profit: number;
  dateMatches: number; friendMatches: number;
  statement: { lines: StatementLine[]; revenue: number; commissions: number; expenses: number; profit: number };
}

const COLUMN_LABELS: Record<keyof Metrics, string> = {
  signups: 'Signups', members: 'Members', bookings: 'Bookings', matchPct: 'Matches', revenue: 'Revenue', expenses: 'Expenses', profit: 'Profit/Loss',
};
// The old report's legend, in our terms.
const COLUMN_HELP: Record<keyof Metrics, string> = {
  signups: 'Number of registrations (by the date they joined, their city and their age then)',
  members: 'Number of different members with a paid booking',
  bookings: 'Number of paid bookings: online, cash, card, pay at door and friends',
  matchPct: 'Percentage of those members who got at least one date or friend match (events whose results are in)',
  revenue: 'How much money was taken in',
  expenses: 'Each event’s expenses, counted once per event',
  profit: 'Revenue less expenses',
};

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(2)}%`;

/** How an event appears in the Per-event list, and what its search matches. */
function eventOptionLabel(e: EventOption): string {
  const day = new Date(e.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: timeZoneForCity(e.city.name) });
  return `#${e.number} · ${day} · ${e.theme.name} · ${e.name} · ${e.venue.name}, ${e.city.name}${e.status === 'CANCELLED' ? ' (cancelled)' : ''}`;
}
// The list shows at most this many matches; searching narrows it.
const EVENT_OPTIONS_SHOWN = 300;
function cell(col: keyof Metrics, m: Metrics) {
  const v = m[col];
  if (v === null) return '-';
  if (col === 'matchPct') return `${v.toFixed(2)}%`;
  if (col === 'revenue' || col === 'expenses' || col === 'profit') return money(v);
  return v.toLocaleString();
}

const EMPTY_FILTERS = { cityId: '', venueId: '', themeId: '', gender: '', ageMin: '', ageMax: '', dateFrom: '', dateTo: '' };

export default function ReportsPage() {
  const [tab, setTab] = useState<'summary' | 'event'>('summary');
  const [themes, setThemes] = useState<Theme[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [shape, setShape] = useState<{ category: Dimension; group: Dimension | 'none'; type: ReportType }>({ category: 'month', group: 'none', type: 'all' });
  const [summary, setSummary] = useState<Overview | null>(null);
  // The filters the Overview was built with (its notes depend on them).
  const [summaryMemberFilters, setSummaryMemberFilters] = useState(false);
  const [breakdown, setBreakdown] = useState<{ data: Breakdown; shape: typeof shape; filters: typeof filters } | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventSearch, setEventSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [eventReport, setEventReport] = useState<EventReport | null>(null);
  const [loadingEventReport, setLoadingEventReport] = useState(false);

  useEffect(() => {
    fetch('/api/event-themes').then((r) => r.json()).then(setThemes);
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/admin/venues').then((r) => r.json()).then(setVenues);
    fetch('/api/admin/reports/events-list').then((r) => r.json()).then((data: EventOption[]) => {
      setEvents(data);
      // Opens on the latest event that has happened, not the furthest-off future one.
      const now = Date.now();
      const latestPast = data.find((e) => new Date(e.startsAt).getTime() <= now) ?? data[0];
      if (latestPast) setSelectedEvent(latestPast.id);
    });
    generate(EMPTY_FILTERS, shape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      setLoadingEventReport(true);
      fetch(`/api/admin/reports/event/${selectedEvent}`).then((r) => r.json()).then(setEventReport).finally(() => setLoadingEventReport(false));
    }
  }, [selectedEvent]);

  const memberFilters = !!filters.gender || !!filters.ageMin || !!filters.ageMax;
  const problem = reportProblem({ ...shape, memberFilters });
  const isPL = shape.type === 'profitLoss';

  // One button drives the report table AND the overview below it, with the
  // same Restrict To filters, so the numbers on the page always agree.
  function generate(f: typeof filters, s: typeof shape) {
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    fetch(`/api/admin/reports/summary?${params}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      setSummary(d);
      setSummaryMemberFilters(!!f.gender || !!f.ageMin || !!f.ageMax);
    });
    setBreakdownError(null);
    setLoadingReport(true);
    const q = new URLSearchParams(params);
    q.set('category', s.category); q.set('group', s.group); q.set('type', s.type);
    fetch(`/api/admin/reports/breakdown?${q}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      setLoadingReport(false);
      if (!r.ok) { setBreakdownError(typeof d.error === 'string' ? d.error : 'The report could not be generated.'); return; }
      setBreakdown({ data: d, shape: s, filters: f });
    });
  }

  const venuesShown = venues.filter((v) => !filters.cityId || v.city.id === filters.cityId);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink print:hidden">Reports</h1>
      <p className="mb-6 text-sm text-ink/60 print:hidden">Build a summary report, or drill into one event.</p>

      <div className="mb-6 flex gap-2 print:hidden">
        <button onClick={() => setTab('summary')} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'summary' ? 'bg-plum text-white' : 'bg-plum/10 text-plum'}`}>Summary</button>
        <button onClick={() => setTab('event')} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'event' ? 'bg-plum text-white' : 'bg-plum/10 text-plum'}`}>Per-event</button>
      </div>

      {tab === 'summary' && (
        <div>
          <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_2fr] print:hidden">
            <Card>
              <h2 className="mb-3 font-extrabold text-ink">Reporting</h2>
              <Field label="Categorise by">
                <Select value={shape.category} onChange={(e) => setShape({ ...shape, category: e.target.value as Dimension })}>
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} disabled={isPL && o.value === 'ageGroup'}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Group by">
                <Select value={shape.group} onChange={(e) => setShape({ ...shape, group: e.target.value as Dimension | 'none' })}>
                  {GROUP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.value === shape.category || (isPL && o.value === 'ageGroup')}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Report type">
                <Select
                  value={shape.type}
                  onChange={(e) => {
                    const type = e.target.value as ReportType;
                    setShape({ ...shape, type });
                    // Age and gender don't apply to a profit/loss statement and
                    // their boxes grey out: cleared too, or they'd still block
                    // "Generate" from boxes that can't be changed.
                    if (type === 'profitLoss') setFilters((f) => ({ ...f, gender: '', ageMin: '', ageMax: '' }));
                  }}
                >
                  {REPORT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            </Card>

            <Card>
              <h2 className="mb-3 font-extrabold text-ink">Restrict to</h2>
              <div className="grid grid-cols-2 gap-x-4 md:grid-cols-4">
                <Field label="Location">
                  <Select value={filters.cityId} onChange={(e) => setFilters({ ...filters, cityId: e.target.value, venueId: '' })}>
                    <option value="">All</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Venue">
                  <Select value={filters.venueId} onChange={(e) => setFilters({ ...filters, venueId: e.target.value })}>
                    <option value="">All</option>
                    {venuesShown.map((v) => <option key={v.id} value={v.id}>{v.name}{filters.cityId ? '' : `, ${v.city.name}`}</option>)}
                  </Select>
                </Field>
                <Field label="Event type">
                  <Select value={filters.themeId} onChange={(e) => setFilters({ ...filters, themeId: e.target.value })}>
                    <option value="">All</option>{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
                <Field label="Gender">
                  <Select value={filters.gender} disabled={isPL} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}>
                    <option value="">Either</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
                  </Select>
                </Field>
                <Field label="Event date from"><Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></Field>
                <Field label="Event date to"><Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></Field>
                <Field label="Age from"><Input type="number" min={18} disabled={isPL} value={filters.ageMin} onChange={(e) => setFilters({ ...filters, ageMin: e.target.value })} /></Field>
                <Field label="Age to"><Input type="number" min={18} disabled={isPL} value={filters.ageMax} onChange={(e) => setFilters({ ...filters, ageMax: e.target.value })} /></Field>
              </div>
              {isPL && <p className="-mt-2 text-xs text-ink/50">Age and gender don&apos;t apply to a profit/loss statement, as expenses are for the whole event.</p>}
            </Card>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
            <Button onClick={() => generate(filters, shape)} disabled={!!problem || loadingReport} loading={loadingReport}>{loadingReport ? 'Generating…' : 'Generate report'}</Button>
            <Button variant="ghost" onClick={() => { setFilters(EMPTY_FILTERS); }}>Clear filters</Button>
            {problem && <p className="text-sm font-medium text-coral">{problem}</p>}
          </div>

          {breakdownError && <p className="mb-4 text-sm font-medium text-coral">{breakdownError}</p>}
          {loadingReport && !breakdown && <Loader label="Generating report…" />}
          {breakdown && <BreakdownTable b={breakdown} cities={cities} venues={venues} themes={themes} />}

          {summary && (
            <div className="print:hidden">
              <h2 className="mb-3 mt-8 text-lg font-extrabold text-ink">Overview</h2>
              {/* Five across: revenue alone didn't answer "did the night make
                  money?" — expenses and profit are what Gil reports on. Built
                  with the table's own rules, so its totals agree with the table. */}
              <div className="mb-2 grid grid-cols-2 gap-4 sm:grid-cols-5">
                <StatBox label="Attendees" value={summary.totals.attendees.toLocaleString()} />
                <StatBox label="Revenue" value={money(summary.totals.revenue)} />
                <StatBox label="Expenses" value={summary.totals.expenses === null ? '-' : money(summary.totals.expenses)} />
                <StatBox label="Profit / loss" value={summary.totals.profit === null ? '-' : money(summary.totals.profit)} />
                <StatBox label="Match rate" value={summary.totals.matchRate === null ? '-' : pct(summary.totals.matchRate)} />
              </div>
              <ul className="mb-6 space-y-0.5 text-xs text-ink/50">
                <li>Only events that have already happened are counted. Upcoming events are in the Per-event tab.</li>
                <li>Attendees: everyone who paid (online, cash, card, pay at door and friends), as in the table&apos;s Bookings.</li>
                <li>Match rate: the share of those members with at least one date or friend match, at events whose results are in{summary.totals.matchRate === null ? ' (none yet)' : ''}.</li>
                {summaryMemberFilters && <li>Expenses and profit aren&apos;t shown when restricted by age or gender: an event&apos;s expenses are for the whole night.</li>}
              </ul>

              <div className="mb-6 grid gap-6 lg:grid-cols-2">
                <Card>
                  <h2 className="mb-3 font-extrabold text-ink">Revenue over time</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={summary.revenueOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EAE6E0" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Line type="monotone" dataKey="revenue" stroke="#3D1E6D" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
                <Card>
                  <h2 className="mb-3 font-extrabold text-ink">Member growth</h2>
                  {summary.memberGrowth === null ? (
                    <p className="text-sm text-ink/50">Not shown: a registration isn&apos;t tied to a venue or an event type.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={summary.memberGrowth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EAE6E0" />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#A4CE39" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <ReportTable title="By event type" rows={summary.byTheme} />
                <ReportTable title="By city" rows={summary.byCity} />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'event' && (
        <div>
          <Card className="mb-6 max-w-2xl print:hidden">
            <EventPicker events={events} search={eventSearch} onSearch={setEventSearch} selected={selectedEvent} onSelect={setSelectedEvent} />
          </Card>

          {loadingEventReport && <Loader label="Loading the event report…" />}
          {eventReport && !loadingEventReport && (
            <>
              {!eventReport.happened && (
                <p role="status" className="mb-4 rounded-lg bg-ink/5 p-3 text-sm text-ink/70 print:hidden">
                  This event hasn&apos;t happened yet, so its figures are 0 until it has.
                </p>
              )}
              <div className="mb-6 grid grid-cols-3 gap-4 print:hidden">
                <StatBox label="Attended" value={eventReport.attended} />
                <StatBox label="Gender split" value={`${eventReport.men}M · ${eventReport.women}F`} />
                <StatBox label="Match rate" value={eventReport.matchRate === null ? 'Results not in yet' : pct(eventReport.matchRate)} />
              </div>
              <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <EventStatement r={eventReport} />
                <Card className="h-fit print:hidden">
                  <h2 className="mb-3 font-extrabold text-ink">Matches</h2>
                  <Row label="Date matches" value={`${eventReport.dateMatches} pairs`} />
                  <Row label="Friend matches" value={`${eventReport.friendMatches} pairs`} />
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownTable({ b, cities, venues, themes }: {
  b: { data: Breakdown; shape: { category: Dimension; group: Dimension | 'none'; type: ReportType }; filters: typeof EMPTY_FILTERS };
  cities: City[]; venues: Venue[]; themes: Theme[];
}) {
  const { data, shape, filters } = b;
  const catLabel = CATEGORY_OPTIONS.find((o) => o.value === shape.category)!.label;
  const groupLabel = shape.group === 'none' ? null : GROUP_OPTIONS.find((o) => o.value === shape.group)!.label;
  const applied = [
    filters.cityId && `Location: ${cities.find((c) => c.id === filters.cityId)?.name}`,
    filters.venueId && `Venue: ${venues.find((v) => v.id === filters.venueId)?.name}`,
    filters.themeId && `Event type: ${themes.find((t) => t.id === filters.themeId)?.name}`,
    filters.gender && `Gender: ${filters.gender === 'MALE' ? 'Male' : 'Female'}`,
    (filters.ageMin || filters.ageMax) && `Age: ${filters.ageMin || 'any'} to ${filters.ageMax || 'any'}`,
    (filters.dateFrom || filters.dateTo) && `Event date: ${filters.dateFrom || 'any'} to ${filters.dateTo || 'any'}`,
  ].filter(Boolean);
  const cols = data.columns;

  return (
    <Card className="mb-6">
      <div className="mb-3 space-y-0.5 text-sm text-ink">
        <p><strong>Category:</strong> {catLabel}{groupLabel && <> · <strong>Group:</strong> {groupLabel}</>} · <strong>Report:</strong> {REPORT_TYPES.find((t) => t.value === shape.type)!.label}</p>
        <p><strong>Filter currently applied:</strong> {applied.length ? applied.join(', ') : 'none'}</p>
      </div>
      {data.categories.length === 0 ? (
        <p className="text-sm text-ink/50">No data for this report.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink/10">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-left text-xs font-bold text-ink/60">
              <tr>
                <th className="px-3 py-2.5">{catLabel}{groupLabel && <span className="block font-normal">{groupLabel}</span>}</th>
                {cols.map((c) => <th key={c} className="px-3 py-2.5 text-right">{COLUMN_LABELS[c]}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <FragmentRows key={c.label} c={c} cols={cols} />
              ))}
              <tr className="border-t-2 border-ink/60 bg-cream/40 font-extrabold">
                <td className="px-3 py-2.5">Total</td>
                {cols.map((col) => <td key={col} className={`px-3 py-2.5 text-right ${negative(col, data.total)}`}>{cell(col, data.total)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <dl className="mt-4 grid gap-x-4 gap-y-1 text-xs text-ink/60 sm:grid-cols-[auto_1fr]">
        {cols.map((c) => (
          <div key={c} className="contents">
            <dt className="font-bold text-ink/70">{COLUMN_LABELS[c]}</dt><dd>{COLUMN_HELP[c]}</dd>
          </div>
        ))}
        {data.signupsHidden && (
          <><dt className="font-bold text-ink/70">Signups</dt><dd>Not shown: a registration isn&apos;t tied to a venue, an event or an event type.</dd></>
        )}
      </dl>
    </Card>
  );
}

const negative = (col: keyof Metrics, m: Metrics) => (col === 'profit' && (m.profit ?? 0) < 0 ? 'text-coral' : '');

function FragmentRows({ c, cols }: { c: CategoryRow; cols: (keyof Metrics)[] }) {
  return (
    <>
      <tr className="border-t border-ink/10 bg-plum/5 font-bold">
        <td className="px-3 py-2">{c.label}</td>
        {cols.map((col) => <td key={col} className={`px-3 py-2 text-right ${negative(col, c.metrics)}`}>{cell(col, c.metrics)}</td>)}
      </tr>
      {c.groups.map((g) => (
        <tr key={g.label} className="border-t border-ink/5">
          <td className="py-2 pl-7 pr-3 text-ink/80">{g.label}</td>
          {cols.map((col) => <td key={col} className={`px-3 py-2 text-right text-ink/80 ${negative(col, g.metrics)}`}>{cell(col, g.metrics)}</td>)}
        </tr>
      ))}
    </>
  );
}

// The old admin's event report: every paid booking, then revenue,
// commissions, expenses and the profit or loss. Printable.
function EventStatement({ r }: { r: EventReport }) {
  const s = r.statement;
  const when = new Date(r.event.startsAt);
  // The event's own local time; the city is named right alongside.
  const timeZone = timeZoneForCity(r.event.city);
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">Event report: #{r.event.number} {r.event.venue}</h2>
          <p className="text-sm text-ink/60">
            {when.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone })} ·{' '}
            {when.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone })} · {r.event.city} · {r.event.theme} · {r.event.name}
          </p>
        </div>
        <Button variant="ghost" onClick={() => window.print()} className="print:hidden">Print</Button>
      </div>

      <h3 className="mb-1 font-extrabold text-ink">Revenue</h3>
      {s.lines.length === 0 ? (
        <p className="mb-2 text-sm text-ink/50">No paid bookings.</p>
      ) : (
        <table className="mb-1 w-full text-sm">
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.id} className="border-b border-ink/5">
                <td className="py-1.5 pr-2 text-ink/40">#{l.badge}</td>
                <td className="py-1.5 pr-3 text-ink">{l.name}</td>
                <td className="py-1.5 pr-3 text-ink/60">
                  {l.method}{l.discountCode && <span className="text-ink/40"> · code {l.discountCode}</span>}
                </td>
                <td className="py-1.5 text-right text-ink">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <StatementTotal label="Total revenue" amount={s.revenue} />

      <h3 className="mb-1 mt-5 font-extrabold text-ink">Commissions</h3>
      <p className="text-xs text-ink/50">None. The new site has no affiliates.</p>
      <StatementTotal label="Total commissions" amount={-s.commissions} />

      <h3 className="mb-1 mt-5 font-extrabold text-ink">Expenses</h3>
      <div className="flex justify-between py-1.5 text-sm">
        <span className="text-ink/80">Event expenses</span>
        <span className="text-coral">{money(-s.expenses)}</span>
      </div>
      <StatementTotal label="Total expenses" amount={-s.expenses} tone="text-coral" />

      <div className="mt-6 flex items-baseline justify-between border-y-2 border-ink/80 py-2">
        <span className="text-lg font-extrabold text-ink">Profit/Loss</span>
        <span className={`text-xl font-extrabold ${s.profit < 0 ? 'text-coral' : 'text-green-dark'}`}>{money(s.profit)}</span>
      </div>
    </Card>
  );
}

function StatementTotal({ label, amount, tone = 'text-ink' }: { label: string; amount: number; tone?: string }) {
  return (
    <div className="flex justify-end gap-6 border-t border-ink/40 pt-1.5 text-sm font-extrabold">
      <span className="text-ink">{label}:</span>
      <span className={`w-28 text-right ${tone}`}>{money(amount)}</span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <div className="text-2xl font-extrabold text-plum">{value}</div>
      <div className="text-xs font-bold uppercase text-ink/50">{label}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink/5 py-2.5 text-sm last:border-0">
      <span className="text-ink/50">{label}</span><span className="font-bold text-ink">{value}</span>
    </div>
  );
}

/** Search every event by number, date, type, name, venue or city, then pick one. */
function EventPicker({ events, search, onSearch, selected, onSelect }: {
  events: EventOption[]; search: string; onSearch: (s: string) => void; selected: string; onSelect: (id: string) => void;
}) {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = words.length ? events.filter((e) => { const t = eventOptionLabel(e).toLowerCase(); return words.every((w) => t.includes(w)); }) : events;
  const shown = matching.slice(0, EVENT_OPTIONS_SHOWN);
  // The chosen event stays in the list even when the search leaves it out.
  const current = events.find((e) => e.id === selected);
  const options = current && !shown.includes(current) ? [current, ...shown] : shown;
  return (
    <>
      <Field label="Find an event">
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Event number, date, type, venue or city" />
      </Field>
      <Field label="Event">
        <Select value={selected} onChange={(e) => onSelect(e.target.value)}>
          {options.map((e) => <option key={e.id} value={e.id}>{eventOptionLabel(e)}</option>)}
        </Select>
      </Field>
      <p className="-mt-2 text-xs text-ink/50">
        {words.length ? `${matching.length.toLocaleString()} of ${events.length.toLocaleString()} events match.` : `${events.length.toLocaleString()} events, newest first.`}
        {matching.length > shown.length && ` Showing the first ${shown.length}: search to narrow it down.`}
      </p>
    </>
  );
}

function ReportTable({ title, rows }: { title: string; rows: OverviewRow[] }) {
  return (
    <Card>
      <h2 className="mb-3 font-extrabold text-ink">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-bold uppercase text-ink/40">
          <tr><th className="pb-2">Name</th><th className="pb-2">Attendees</th><th className="pb-2">Revenue</th><th className="pb-2">Expenses</th><th className="pb-2">Profit / loss</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-ink/5">
              <td className="py-2 font-bold text-ink">{r.name}</td>
              <td className="py-2">{r.attendees}</td>
              <td className="py-2">{money(r.revenue)}</td>
              <td className="py-2">{r.expenses === null ? '-' : money(r.expenses)}</td>
              {/* Losses read as -$120, not ($120) or $-120. */}
              <td className={`py-2 font-bold ${r.profit === null ? 'text-ink/50' : r.profit < 0 ? 'text-coral' : 'text-green-dark'}`}>
                {r.profit === null ? '-' : money(r.profit)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="py-3 text-ink/40">No data for this filter.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
