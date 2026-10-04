'use client';

import { useState, useEffect } from 'react';
import { Field, Input, Select, Button, Card, Badge, Loader } from '@/components/ui';
import { discountDay, formatDiscountDay } from '@/lib/discountDates';
import { timeZoneForCity } from '@/lib/timezone';

interface ScopeEvent { id: string; number: number; name: string; startsAt: string; venue: { name: string }; city?: { name: string } }

interface DiscountCode {
  id: string; code: string; type: string; amount: string | null;
  validFrom: string; validTo: string; usedCount: number;
  // "Event": null = All events. scopeEvent is { deleted: true } when the
  // chosen event has since been deleted (the code then works for no event).
  scopeEventId: string | null;
  scopeEvent: ScopeEvent | { deleted: true } | null;
}

interface EventOption extends ScopeEvent { draft: boolean; status: string }

const emptyForm = { code: '', type: 'PERCENT_OFF', amount: '', validFrom: '', validTo: '', scopeEventId: '' };

// "#12 28-40 years at Soultrap Bar, 2 Oct 2026", as in the blast forms, with
// the year so past events can be told apart. The date is the event city's.
function eventLabel(e: ScopeEvent) {
  const date = new Date(e.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: timeZoneForCity(e.city?.name) });
  return `#${e.number} ${e.name} at ${e.venue.name}, ${date}`;
}

export default function AdminDiscountsPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  // False until the first fetch returns, so the list doesn't claim to be empty while loading.
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Every event, for the "Event" dropdown: upcoming soonest first, then past
  // ones most recent first.
  const [events, setEvents] = useState<EventOption[]>([]);

  function loadCodes() {
    fetch('/api/admin/discount-codes').then((r) => r.json()).then((d) => { setCodes(d); setLoaded(true); });
  }
  useEffect(() => {
    loadCodes();
    fetch('/api/admin/events').then((r) => r.json()).then((all: EventOption[]) => setEvents(all)).catch(() => {});
  }, []);

  const now = Date.now();
  const upcomingEvents = events.filter((e) => new Date(e.startsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const pastEvents = events.filter((e) => new Date(e.startsAt).getTime() < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const optionLabel = (e: EventOption) => `${eventLabel(e)}${e.draft ? ' (draft)' : e.status === 'CANCELLED' ? ' (cancelled)' : ''}`;
  // A code limited to an event that has since been deleted keeps that choice
  // until the admin picks another.
  const editingCode = codes.find((c) => c.id === editing);
  const scopeEventGone = !!form.scopeEventId && !events.some((e) => e.id === form.scopeEventId) && !!editingCode?.scopeEvent && 'deleted' in editingCode.scopeEvent;

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(c: DiscountCode) {
    setEditing(c.id);
    setForm({ code: c.code, type: c.type, amount: c.amount ?? '', validFrom: discountDay(c.validFrom), validTo: discountDay(c.validTo), scopeEventId: c.scopeEventId ?? '' });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // An empty amount is sent as "none", so the server says it's needed
    // (sending nothing used to keep the old amount when editing).
    const payload = { ...form, amount: form.amount === '' || form.type === 'FREE' ? null : Number(form.amount), scopeEventId: form.scopeEventId || null };
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
              {form.type === 'FREE' ? <div /> : (
                <Field label={form.type === 'PERCENT_OFF' ? 'Amount (% off, 1 to 100)' : 'Amount ($ off)'}>
                  <Input type="number" required min={form.type === 'PERCENT_OFF' ? 1 : 0.01} max={form.type === 'PERCENT_OFF' ? 100 : undefined} step="any"
                    value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </Field>
              )}
              <div />
              <Field label="Valid from"><Input type="date" required value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></Field>
              <Field label="Valid to"><Input type="date" required value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></Field>
              <p className="col-span-2 -mt-2 mb-3 text-xs text-ink/50">From 12:00 am on the first day to 11:59 pm on the last, Sydney time.</p>
              <div className="col-span-2">
                <Field label="Event">
                  <Select value={form.scopeEventId} onChange={(e) => setForm({ ...form, scopeEventId: e.target.value })}>
                    <option value="">All</option>
                    {scopeEventGone && <option value={form.scopeEventId}>(an event that has been deleted)</option>}
                    {upcomingEvents.length > 0 && (
                      <optgroup label="Upcoming events">
                        {upcomingEvents.map((e) => <option key={e.id} value={e.id}>{optionLabel(e)}</option>)}
                      </optgroup>
                    )}
                    {pastEvents.length > 0 && (
                      <optgroup label="Past events">
                        {pastEvents.map((e) => <option key={e.id} value={e.id}>{optionLabel(e)}</option>)}
                      </optgroup>
                    )}
                  </Select>
                  <p className="mt-1 text-xs text-ink/50">&quot;All&quot; works for every event. Choose one event to make the code work for that event only.</p>
                </Field>
              </div>
            </div>
            {error && <p className="mb-3 text-sm font-medium text-coral">{error}</p>}
            <Button type="submit">{editing ? 'Save changes' : 'Create code'}</Button>
            <Button type="button" variant="ghost" className="ml-2" onClick={() => setShowForm(false)}>Cancel</Button>
          </form>
        </Card>
      )}

      {!loaded && <Loader label="Loading discount codes…" />}
      <div className="space-y-2">
        {codes.map((c) => {
          const expired = new Date(c.validTo) < new Date();
          return (
            <button key={c.id} onClick={() => openEdit(c)} className="flex w-full items-center justify-between rounded-lg border border-ink/10 bg-white p-3 text-left hover:border-plum">
              <div>
                <div className="font-mono font-extrabold text-ink">{c.code}</div>
                <div className="text-xs text-ink/50">
                  {c.type === 'PERCENT_OFF' ? `${c.amount}% off` : c.type === 'FIXED_REDUCTION' ? `$${c.amount} off` : 'Free'} · Used {c.usedCount} times
                  <br />{formatDiscountDay(c.validFrom)} to {formatDiscountDay(c.validTo)}
                  {c.scopeEvent && (
                    <><br />Only for {'deleted' in c.scopeEvent ? 'an event that has been deleted' : eventLabel(c.scopeEvent)}</>
                  )}
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
