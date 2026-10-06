'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card, Badge, Loader } from '@/components/ui';
import { memberFilterFromParams, memberFilterToParams, describeMemberFilter } from '@/lib/memberFilterParams';
import { calculateAge } from '@/lib/age';

interface Member { id: string; name: string; email: string; mobile: string; city: { name: string }; gender: string; dateOfBirth: string; _count: { bookings: number }; }
interface Totals { count: number; male: number; female: number; totalMatches: number; }
interface City { id: string; name: string; }

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  // True while a page of members is being fetched (first load and every re-filter).
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [cities, setCities] = useState<City[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ search: '', gender: '', cityId: '', ageMin: '', ageMax: '' });
  // The filter the list on screen was actually loaded with. Export and Blast
  // use THIS, not the boxes above — someone who edits a box without pressing
  // "Apply filters" must not export or blast a different set from the one
  // they're looking at.
  const [applied, setApplied] = useState('');

  // One place to build the query string, so the CSV export can never drift
  // out of sync with what's on screen — an export that silently ignored the
  // city filter would be worse than no export at all.
  function filterParams() {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.gender) params.set('gender', filters.gender);
    if (filters.cityId) params.set('cityId', filters.cityId);
    if (filters.ageMin) params.set('ageMin', filters.ageMin);
    if (filters.ageMax) params.set('ageMax', filters.ageMax);
    return params;
  }

  function loadMembers(pageNum: number, query: string) {
    const params = new URLSearchParams(query);
    setApplied(query);
    params.set('page', String(pageNum));

    setLoadingMembers(true);
    fetch(`/api/admin/members?${params}`).then((r) => r.json()).then((data) => {
      setLoadingMembers(false);
      setMembers(data.members);
      setTotals(data.totals);
      setTotalPages(data.totalPages);
      setPage(data.page);
    });
  }

  useEffect(() => {
    // Start from a filter in the URL — "Back to members" from the blast page
    // returns to the same filtered list rather than everyone.
    const f = memberFilterFromParams(new URLSearchParams(window.location.search));
    setFilters({
      search: f.search ?? '', gender: f.gender ?? '', cityId: f.cityId ?? '',
      ageMin: f.ageMin != null ? String(f.ageMin) : '', ageMax: f.ageMax != null ? String(f.ageMax) : '',
    });
    loadMembers(1, memberFilterToParams(f).toString());
    fetch('/api/cities').then((r) => r.json()).then(setCities);
  }, []);

  function handleExport() {
    window.open(`/api/admin/members/export?${applied}`, '_blank');
  }

  const appliedFilter = memberFilterFromParams(new URLSearchParams(applied));
  const appliedSummary = describeMemberFilter(appliedFilter, cities.find((c) => c.id === appliedFilter.cityId)?.name);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-extrabold text-ink">Members</h1>
          <p className="text-sm text-ink/60">{totals ? `${totals.count.toLocaleString()} members currently match this filter.` : 'Loading…'}</p>
        </div>
        {/* Registers someone without an event (Gil). */}
        <Link href="/admin/members/new"><Button>+ Add member</Button></Link>
      </div>

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Search"><Input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Name, email, mobile" /></Field>
          <Field label="Gender">
            <Select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}>
              <option value="">Any</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
            </Select>
          </Field>
          <Field label="City">
            <Select value={filters.cityId} onChange={(e) => setFilters({ ...filters, cityId: e.target.value })}>
              <option value="">Any</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Age from"><Input type="number" value={filters.ageMin} onChange={(e) => setFilters({ ...filters, ageMin: e.target.value })} /></Field>
          <Field label="Age to"><Input type="number" value={filters.ageMax} onChange={(e) => setFilters({ ...filters, ageMax: e.target.value })} /></Field>
        </div>
        <Button onClick={() => loadMembers(1, filterParams().toString())} className="mt-2">Apply filters</Button>
        <Button variant="ghost" className="mt-2 ml-2" onClick={handleExport}>Export CSV</Button>
      </Card>

      {/* As on the old admin: once a list is showing, blast exactly that list. */}
      {totals && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-plum/20 bg-white p-3">
          <div className="text-sm">
            <span className="font-bold text-ink">Filter currently applied: </span>
            <span className="text-ink/70">{appliedSummary.length ? appliedSummary.join(' · ') : 'none (every member)'}</span>
          </div>
          <Button onClick={() => router.push(`/admin/members/blast?${applied}`)} disabled={totals.count === 0}>
            Click here to blast these filtered members
          </Button>
        </div>
      )}

      {totals && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatBox label="Matching" value={totals.count} />
          <StatBox label="Gender split" value={`${totals.male}M · ${totals.female}F`} />
          <StatBox label="Total matches" value={totals.totalMatches} />
        </div>
      )}

      {/* Scrolls sideways on a phone, like the events and venues tables,
          rather than squeezing seven columns into the screen width. */}
      <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Mobile</th><th className="px-4 py-3">Gender</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">City</th><th className="px-4 py-3">Events attended</th><th className="px-4 py-3 text-right">Action</th></tr>
          </thead>
          <tbody>
            {loadingMembers ? (
              <tr><td colSpan={8}><Loader label="Loading members…" /></td></tr>
            ) : members.map((m) => (
              <tr key={m.id} className="cursor-pointer border-t border-ink/5 hover:bg-cream/30" onClick={() => router.push(`/admin/members/${m.id}`)}>
                <td className="px-4 py-3 font-bold text-ink">{m.name}</td>
                <td className="px-4 py-3 text-ink/60">{m.email}</td>
                <td className="px-4 py-3 text-ink/60">{m.mobile}</td>
                <td className="px-4 py-3 text-ink/60">{m.gender === 'MALE' ? 'Male' : 'Female'}</td>
                <td className="px-4 py-3 text-ink/60">{calculateAge(new Date(m.dateOfBirth))}</td>
                <td className="px-4 py-3 text-ink/60">{m.city?.name}</td>
                <td className="px-4 py-3"><Badge tone="green">{m._count.bookings}</Badge></td>
                <td className="px-4 py-3 text-right">
                  {/* Same destination as clicking the row: a visible target,
                      as on the events list. */}
                  <Link
                    href={`/admin/members/${m.id}`}
                    onClick={(ev) => ev.stopPropagation()}
                    className="inline-block rounded-lg border border-plum bg-white px-3 py-1.5 text-xs font-bold text-plum hover:bg-plum hover:text-white"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <Button variant="ghost" disabled={page <= 1} onClick={() => loadMembers(page - 1, applied)}>Previous</Button>
        <span className="text-ink/60">Page {page} of {totalPages}</span>
        <Button variant="ghost" disabled={page >= totalPages} onClick={() => loadMembers(page + 1, applied)}>Next</Button>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-plum/10 p-3">
      <div className="text-lg font-extrabold text-plum">{value}</div>
      <div className="text-xs font-bold uppercase text-ink/50">{label}</div>
    </div>
  );
}
