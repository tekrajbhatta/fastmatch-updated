'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Field, Input, Select, Button, Card } from '@/components/ui';

interface Theme { id: string; name: string; }
interface City { id: string; name: string; }
interface EventOption {
  id: string; name: string; startsAt: string; venue: { name: string; address: string | null }; ageMin: number; ageMax: number;
  theme: { name: string }; city: { name: string };
}

interface SummaryData {
  totals: { attendees: number; revenue: number; matchRate: number };
  byTheme: { name: string; attendees: number; revenue: number }[];
  byCity: { name: string; attendees: number; revenue: number }[];
  revenueOverTime: { month: string; revenue: number }[];
  memberGrowth: { month: string; count: number }[];
}

interface EventReport {
  event: { id: string; name: string; startsAt: string };
  attended: number; men: number; women: number; matchRate: number;
  revenue: number; expenses: number; profit: number;
  dateMatches: number; friendMatches: number;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<'summary' | 'event'>('summary');
  const [themes, setThemes] = useState<Theme[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [filters, setFilters] = useState({ themeId: '', cityId: '', gender: '', ageMin: '', ageMax: '', dateFrom: '', dateTo: '' });
  const [summary, setSummary] = useState<SummaryData | null>(null);

  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [eventReport, setEventReport] = useState<EventReport | null>(null);

  useEffect(() => {
    fetch('/api/event-themes').then((r) => r.json()).then(setThemes);
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/admin/reports/events-list').then((r) => r.json()).then((data) => {
      setEvents(data);
      if (data.length) setSelectedEvent(data[0].id);
    });
    loadSummary({});
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      fetch(`/api/admin/reports/event/${selectedEvent}`).then((r) => r.json()).then(setEventReport);
    }
  }, [selectedEvent]);

  // Partial<>: the initial load calls this with {} to fetch unfiltered totals,
  // and the body only keeps truthy entries anyway, so requiring all seven
  // fields was too strict and failed to compile as delivered.
  function loadSummary(f: Partial<typeof filters>) {
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    fetch(`/api/admin/reports/summary?${params}`).then((r) => r.json()).then(setSummary);
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Reports</h1>
      <p className="mb-6 text-sm text-ink/60">Filter across all events, then view by category or drill into one event.</p>

      <div className="mb-6 flex gap-2">
        <button onClick={() => setTab('summary')} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'summary' ? 'bg-plum text-white' : 'bg-plum/10 text-plum'}`}>Summary</button>
        <button onClick={() => setTab('event')} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'event' ? 'bg-plum text-white' : 'bg-plum/10 text-plum'}`}>Per-event</button>
      </div>

      {tab === 'summary' && (
        <div>
          <Card className="mb-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
              <Field label="Theme">
                <Select value={filters.themeId} onChange={(e) => setFilters({ ...filters, themeId: e.target.value })}>
                  <option value="">All</option>{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="City">
                <Select value={filters.cityId} onChange={(e) => setFilters({ ...filters, cityId: e.target.value })}>
                  <option value="">All</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Gender">
                <Select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}>
                  <option value="">Any</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
                </Select>
              </Field>
              <Field label="Age from"><Input type="number" value={filters.ageMin} onChange={(e) => setFilters({ ...filters, ageMin: e.target.value })} /></Field>
              <Field label="Age to"><Input type="number" value={filters.ageMax} onChange={(e) => setFilters({ ...filters, ageMax: e.target.value })} /></Field>
              <Field label="From"><Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></Field>
              <Field label="To"><Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></Field>
            </div>
            <Button onClick={() => loadSummary(filters)} className="mt-2">Apply filters</Button>
          </Card>

          {summary && (
            <>
              <div className="mb-6 grid grid-cols-3 gap-4">
                <StatBox label="Attendees" value={summary.totals.attendees.toLocaleString()} />
                <StatBox label="Revenue" value={`$${summary.totals.revenue.toLocaleString()}`} />
                <StatBox label="Match rate" value={`${summary.totals.matchRate}%`} />
              </div>

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
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={summary.memberGrowth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EAE6E0" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#A4CE39" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <ReportTable title="By event theme" rows={summary.byTheme} />
                <ReportTable title="By city" rows={summary.byCity} />
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'event' && (
        <div>
          <Card className="mb-6 max-w-md">
            <Field label="Event">
              <Select value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {new Date(e.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} — {e.theme.name} — {e.venue.name} — Ages {e.ageMin}-{e.ageMax}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>

          {eventReport && (
            <>
              <div className="mb-6 grid grid-cols-3 gap-4">
                <StatBox label="Attended" value={eventReport.attended} />
                <StatBox label="Gender split" value={`${eventReport.men}M · ${eventReport.women}F`} />
                <StatBox label="Match rate" value={`${eventReport.matchRate}%`} />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <h2 className="mb-3 font-extrabold text-ink">Financials</h2>
                  <Row label="Revenue" value={`$${eventReport.revenue.toFixed(2)}`} />
                  <Row label="Expenses" value={`$${eventReport.expenses.toFixed(2)}`} />
                  <Row label="Profit" value={`$${eventReport.profit.toFixed(2)}`} />
                </Card>
                <Card>
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

function ReportTable({ title, rows }: { title: string; rows: { name: string; attendees: number; revenue: number }[] }) {
  return (
    <Card>
      <h2 className="mb-3 font-extrabold text-ink">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-bold uppercase text-ink/40">
          <tr><th className="pb-2">Name</th><th className="pb-2">Attendees</th><th className="pb-2">Revenue</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-ink/5">
              <td className="py-2 font-bold text-ink">{r.name}</td>
              <td className="py-2">{r.attendees}</td>
              <td className="py-2">${r.revenue.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="py-3 text-ink/40">No data for this filter.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
