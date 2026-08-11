'use client';

import { useState, useEffect } from 'react';
import { Field, Input, Select, Button, Card, Badge } from '@/components/ui';

interface Member { id: string; name: string; email: string; city: { name: string }; gender: string; _count: { bookings: number }; }
interface Totals { count: number; male: number; female: number; totalMatches: number; }

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ search: '', gender: '', ageMin: '', ageMax: '' });

  function loadMembers(pageNum = 1) {
    const params = new URLSearchParams({ page: String(pageNum) });
    if (filters.search) params.set('search', filters.search);
    if (filters.gender) params.set('gender', filters.gender);
    if (filters.ageMin) params.set('ageMin', filters.ageMin);
    if (filters.ageMax) params.set('ageMax', filters.ageMax);

    fetch(`/api/admin/members?${params}`).then((r) => r.json()).then((data) => {
      setMembers(data.members);
      setTotals(data.totals);
      setTotalPages(data.totalPages);
      setPage(data.page);
    });
  }

  useEffect(() => { loadMembers(1); }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Members</h1>
      <p className="mb-6 text-sm text-ink/60">{totals ? `${totals.count.toLocaleString()} members currently match this filter.` : 'Loading…'}</p>

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Search"><Input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Name, email, mobile" /></Field>
          <Field label="Gender">
            <Select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}>
              <option value="">Any</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
            </Select>
          </Field>
          <Field label="Age from"><Input type="number" value={filters.ageMin} onChange={(e) => setFilters({ ...filters, ageMin: e.target.value })} /></Field>
          <Field label="Age to"><Input type="number" value={filters.ageMax} onChange={(e) => setFilters({ ...filters, ageMax: e.target.value })} /></Field>
        </div>
        <Button onClick={() => loadMembers(1)} className="mt-2">Apply filters</Button>
      </Card>

      {totals && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatBox label="Matching" value={totals.count} />
          <StatBox label="Gender split" value={`${totals.male}M · ${totals.female}F`} />
          <StatBox label="Total matches" value={totals.totalMatches} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">City</th><th className="px-4 py-3">Events attended</th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-ink/5">
                <td className="px-4 py-3 font-bold text-ink">{m.name}</td>
                <td className="px-4 py-3 text-ink/60">{m.city?.name}</td>
                <td className="px-4 py-3"><Badge tone="green">{m._count.bookings}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <Button variant="ghost" disabled={page <= 1} onClick={() => loadMembers(page - 1)}>Previous</Button>
        <span className="text-ink/60">Page {page} of {totalPages}</span>
        <Button variant="ghost" disabled={page >= totalPages} onClick={() => loadMembers(page + 1)}>Next</Button>
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
