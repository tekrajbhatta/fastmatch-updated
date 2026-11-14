'use client';

import { useState, useEffect } from 'react';
import { Field, Input, Select, Button, Card, Badge, Loader } from '@/components/ui';
import { discountDay, formatDiscountDay, discountStatus } from '@/lib/discountDates';
import { formatPrice } from '@/lib/price';
import { countOf } from '@/lib/plural';

/**
 * Affiliates (Gil, Nov): partners who promote our events. Each promotion is
 * a code their customers type when booking: it gives the discount, and every
 * booking made with it earns the affiliate its commission, a % of the
 * event's cost (src/lib/affiliates.ts). The commissions are in Reports,
 * "Commissions due to affiliates".
 */

interface Promotion {
  id: string; code: string; type: 'PERCENT_OFF' | 'FIXED_REDUCTION'; amount: string | null;
  validFrom: string; validTo: string; usedCount: number;
  affiliate: { id: string; name: string }; commissionPercent: string;
  /** Paid bookings that earned a commission, and the total. */
  bookings: number; commission: number;
}

const emptyForm = { affiliateName: '', commissionPercent: '', code: '', type: 'PERCENT_OFF', amount: '', validFrom: '', validTo: '' };
type Form = typeof emptyForm;

const percent = (v: string | number) => `${Number(v).toString()}%`;

export default function AdminAffiliatesPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The promotion being changed; null for a new one (or a copy).
  const [editing, setEditing] = useState<string | null>(null);
  const [copyOf, setCopyOf] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch('/api/admin/affiliates').then((r) => r.json()).then((d) => {
      setPromotions(Array.isArray(d.promotions) ? d.promotions : []);
      setNames(Array.isArray(d.affiliates) ? d.affiliates.map((a: { name: string }) => a.name) : []);
      setLoaded(true);
    });
  }
  useEffect(() => { load(); }, []);

  const open = (next: Form, id: string | null, copy: string | null = null) => {
    setEditing(id); setCopyOf(copy); setForm(next); setError(null); setShowForm(true);
    // The form opens above the list: bring it into view.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const formOf = (p: Promotion): Form => ({
    affiliateName: p.affiliate.name, commissionPercent: Number(p.commissionPercent).toString(), code: p.code, type: p.type,
    amount: p.amount == null ? '' : Number(p.amount).toString(), validFrom: discountDay(p.validFrom), validTo: discountDay(p.validTo),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      ...form,
      commissionPercent: form.commissionPercent === '' ? undefined : Number(form.commissionPercent),
      amount: form.amount === '' ? null : Number(form.amount),
    };
    const res = editing
      ? await fetch(`/api/admin/affiliates/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/admin/affiliates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check the promotion’s details.'); return; }
    setShowForm(false);
    load();
  }

  async function remove() {
    if (!editing || !confirm(`Delete the promotion ${form.code}? This can't be undone.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/affiliates/${editing}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not delete this promotion.'); return; }
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Affiliates</h1>
          <p className="max-w-2xl text-sm text-ink/60">
            Partners who promote our events. Their customers book with the promotion&apos;s code and get its discount, and each booking
            made with it earns the affiliate their commission: a % of the event&apos;s cost. See them in Reports, &ldquo;Commissions due to affiliates&rdquo;.
          </p>
        </div>
        <Button onClick={() => open(emptyForm, null)} className="whitespace-nowrap">+ New promotion</Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-3 font-extrabold text-ink">
            {editing ? `Promotion ${form.code}` : copyOf ? `New promotion (a copy of ${copyOf})` : 'New promotion'}
          </h2>
          <form onSubmit={save}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name of affiliate">
                <Input required list="affiliate-names" value={form.affiliateName} placeholder="e.g. RSVP" onChange={(e) => setForm({ ...form, affiliateName: e.target.value })} />
                <datalist id="affiliate-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field label="Affiliate commission (%)">
                <Input type="number" required min={0.01} max={100} step="any" placeholder="e.g. 20" value={form.commissionPercent}
                  onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} />
              </Field>
              <p className="col-span-2 -mt-2 mb-3 text-xs text-ink/50">
                The commission is this % of the event&apos;s cost, once for each booking made with the code (20% of a $50 event is $10).
                Bookings already made keep the % they were made with.
              </p>
              <Field label="Affiliate code">
                <Input required value={form.code} placeholder="e.g. RSVP10" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
              </Field>
              <div />
              <Field label="Affiliate discount">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="PERCENT_OFF">Percentage off</option>
                  <option value="FIXED_REDUCTION">Dollar off</option>
                </Select>
              </Field>
              <Field label={form.type === 'PERCENT_OFF' ? 'Discount (% off, 1 to 100)' : 'Discount ($ off)'}>
                <Input type="number" required min={form.type === 'PERCENT_OFF' ? 1 : 0.01} max={form.type === 'PERCENT_OFF' ? 100 : undefined} step="any"
                  value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Promotion from"><Input type="date" required value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></Field>
              <Field label="Promotion till"><Input type="date" required value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></Field>
              <p className="col-span-2 -mt-2 mb-3 text-xs text-ink/50">
                From 12:00 am on the first day to 11:59 pm on the last, Sydney time. It works for every event, once per member, like any discount code.
              </p>
            </div>
            {error && <p role="alert" className="mb-3 text-sm font-medium text-coral">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving} loading={saving}>Save promotion</Button>
              {editing && (
                <>
                  <Button type="button" variant="ghost" onClick={() => open({ ...form, code: '' }, null, form.code)}>Duplicate promotion</Button>
                  <Button type="button" variant="ghost" onClick={remove}>Delete promotion</Button>
                </>
              )}
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
            {editing && (
              <p className="mt-3 text-xs text-ink/50">
                &ldquo;Duplicate promotion&rdquo; opens a new promotion with the same details, for you to give a new code. A promotion that
                has been used can&apos;t be deleted: change its &ldquo;Promotion till&rdquo; date to stop it.
              </p>
            )}
          </form>
        </Card>
      )}

      {!loaded && <Loader label="Loading affiliates…" />}
      {loaded && promotions.length === 0 && !showForm && (
        <p className="rounded-lg border border-ink/10 bg-white p-4 text-sm text-ink/60">No promotions yet. Press &ldquo;+ New promotion&rdquo; to add one.</p>
      )}
      <div className="space-y-2">
        {promotions.map((p) => {
          const status = discountStatus(p);
          return (
            <button key={p.id} onClick={() => open(formOf(p), p.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink/10 bg-white p-3 text-left hover:border-plum">
              <div>
                <div className="font-extrabold text-ink">{p.affiliate.name} <span className="ml-1 font-mono">{p.code}</span></div>
                <div className="text-xs text-ink/60">
                  {p.type === 'PERCENT_OFF' ? `${percent(p.amount ?? 0)} off` : `${formatPrice(p.amount ?? 0)} off`} · {percent(p.commissionPercent)} commission
                  <br />{formatDiscountDay(p.validFrom)} to {formatDiscountDay(p.validTo)}
                  <br />{countOf(p.bookings, 'booking', 'bookings')}{p.bookings > 0 ? ` · ${formatPrice(p.commission)} commission` : ''}
                </div>
              </div>
              {status === 'expired' ? <Badge tone="muted">Ended</Badge>
                : status === 'not-started' ? <Badge tone="plum">Starts {formatDiscountDay(p.validFrom)}</Badge>
                  : <Badge tone="green">Active</Badge>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
