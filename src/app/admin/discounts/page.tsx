'use client';

import { useState, useEffect } from 'react';
import { Field, Input, Select, Button, Card, Badge } from '@/components/ui';

interface DiscountCode {
  id: string; code: string; type: string; amount: string | null;
  validFrom: string; validTo: string; usedCount: number;
}

const emptyForm = { code: '', type: 'PERCENT_OFF', amount: '', validFrom: '', validTo: '' };

export default function AdminDiscountsPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadCodes() {
    fetch('/api/admin/discount-codes').then((r) => r.json()).then(setCodes);
  }
  useEffect(() => { loadCodes(); }, []);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(c: DiscountCode) {
    setEditing(c.id);
    setForm({ code: c.code, type: c.type, amount: c.amount ?? '', validFrom: c.validFrom.slice(0, 10), validTo: c.validTo.slice(0, 10) });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = { ...form, amount: form.amount ? Number(form.amount) : undefined };
    const res = editing
      ? await fetch(`/api/admin/discount-codes/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/admin/discount-codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check your details.'); return; }
    setShowForm(false);
    loadCodes();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-ink">Discount codes</h1><p className="text-sm text-ink/60">Percent off, fixed reduction, or free.</p></div>
        <Button onClick={openNew}>+ New code</Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-3 font-extrabold text-ink">{editing ? `Edit ${form.code}` : 'New discount code'}</h2>
          <form onSubmit={handleSave}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code"><Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="PERCENT_OFF">Percent off</option>
                  <option value="FIXED_REDUCTION">Fixed reduction</option>
                  <option value="FREE">Free</option>
                </Select>
              </Field>
              <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
              <div />
              <Field label="Valid from"><Input type="date" required value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></Field>
              <Field label="Valid to"><Input type="date" required value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></Field>
            </div>
            {error && <p className="mb-3 text-sm font-medium text-coral">{error}</p>}
            <Button type="submit">{editing ? 'Save changes' : 'Create code'}</Button>
            <Button type="button" variant="ghost" className="ml-2" onClick={() => setShowForm(false)}>Cancel</Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {codes.map((c) => {
          const expired = new Date(c.validTo) < new Date();
          return (
            <button key={c.id} onClick={() => openEdit(c)} className="flex w-full items-center justify-between rounded-lg border border-ink/10 bg-white p-3 text-left hover:border-plum">
              <div>
                <div className="font-mono font-extrabold text-ink">{c.code}</div>
                <div className="text-xs text-ink/50">
                  {c.type === 'PERCENT_OFF' ? `${c.amount}% off` : c.type === 'FIXED_REDUCTION' ? `$${c.amount} off` : 'Free'} · Used {c.usedCount} times
                  <br />{new Date(c.validFrom).toLocaleDateString('en-AU')} to {new Date(c.validTo).toLocaleDateString('en-AU')}
                </div>
              </div>
              <Badge tone={expired ? 'muted' : 'green'}>{expired ? 'Expired' : 'Active'}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
