'use client';

import { useState, useEffect } from 'react';
import { Field, Input, Select, Button, Card, Badge, Loader } from '@/components/ui';
import { discountDay, formatDiscountDay, discountStatus } from '@/lib/discountDates';
import { timeZoneForCity } from '@/lib/timezone';
import { formatPrice } from '@/lib/price';

interface ScopeEvent { id: string; number: number; name: string; startsAt: string; venue: { name: string }; city?: { name: string } }

interface DiscountCode {
  id: string; code: string; type: string; amount: string | null;
  validFrom: string; validTo: string; usedCount: number;
  // "Event": null = All events. scopeEvent is { deleted: true } when the
  // chosen event has since been deleted (the code then works for no event).
  scopeEventId: string | null;
  scopeEvent: ScopeEvent | { deleted: true } | null;
  // "Event type": the same, for one event type.
  scopeThemeId: string | null;
  scopeTheme: { id: string; name: string } | { deleted: true } | null;
}

interface EventType { id: string; name: string }

interface EventOption extends ScopeEvent { draft: boolean; status: string }

const emptyForm = { code: '', type: 'PERCENT_OFF', amount: '', validFrom: '', validTo: '', scopeEventId: '', scopeThemeId: '' };

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
  // The event types, for the "Event type" dropdown (as on the event forms).
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);

  function loadCodes() {
    fetch('/api/admin/discount-codes').then((r) => r.json()).then((d) => { setCodes(d); setLoaded(true); });
  }
  useEffect(() => {
    loadCodes();
    fetch('/api/admin/events').then((r) => r.json()).then((all: EventOption[]) => setEvents(all)).catch(() => {});
    fetch('/api/event-themes').then((r) => r.json()).then((all: EventType[]) => setEventTypes(Array.isArray(all) ? all : [])).catch(() => {});
  }, []);

  const now = Date.now();
  const upcomingEvents = events.filter((e) => new Date(e.startsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const pastEvents = events.filter((e) => new Date(e.startsAt).getTime() < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const optionLabel = (e: EventOption) => `${eventLabel(e)}${e.draft ? ' (draft)' : e.status === 'CANCELLED' ? ' (cancelled)' : ''}`;
  // A code limited to an event that has since been deleted keeps that choice
  // until the admin picks another.
  const editingCode = codes.find((c) => c.id === editing);
  const scopeEventGone = !!form.scopeEventId && !events.some((e) => e.id === form.scopeEventId) && !!editingCode?.scopeEvent && 'deleted' in editingCode.scopeEvent;
  const scopeThemeGone = !!form.scopeThemeId && !eventTypes.some((t) => t.id === form.scopeThemeId) && !!editingCode?.scopeTheme && 'deleted' in editingCode.scopeTheme;

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(c: DiscountCode) {
    setEditing(c.id);
    setForm({ code: c.code, type: c.type, amount: c.amount ?? '', validFrom: discountDay(c.validFrom), validTo: discountDay(c.validTo), scopeEventId: c.scopeEventId ?? '', scopeThemeId: c.scopeThemeId ?? '' });
    setShowForm(true);
    // The form opens above the list: bring it into view (on a phone it was off the screen).
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // An empty amount is sent as "none", so the server says it's needed
    // (sending nothing used to keep the old amount when editing).
    const payload = {
      ...form,
      amount: form.amount === '' || form.type === 'FREE' ? null : Number(form.amount),
      scopeEventId: form.scopeEventId || null,
      // A code for one event needs no event type (the server clears it too).
      scopeThemeId: form.scopeEventId ? null : form.scopeThemeId || null,
    };
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-ink">Discount codes</h1><p className="text-sm text-ink/60">Percent off, fixed reduction, or free.</p></div>
        <Button onClick={openNew} className="whitespace-nowrap">+ New code</Button>
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
                <Field label="Event type">
                  <Select value={form.scopeEventId ? '' : form.scopeThemeId} disabled={!!form.scopeEventId} onChange={(e) => setForm({ ...form, scopeThemeId: e.target.value })}>
                    <option value="">All</option>
                    {scopeThemeGone && <option value={form.scopeThemeId}>(an event type that has been deleted)</option>}
                    {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                  <p className="mt-1 text-xs text-ink/50">
                    {form.scopeEventId
                      ? 'Not needed: the code is for the one event chosen below.'
                      : '"All" works for every type of event. Choose one to make the code work only for events of that type.'}
                  </p>
                </Field>
              </div>
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
          const status = discountStatus(c);
          // Limited to an event, or an event type, that has since been deleted: it works nowhere.
          const noEvent = (!!c.scopeEvent && 'deleted' in c.scopeEvent) || (!!c.scopeTheme && 'deleted' in c.scopeTheme);
          return (
            <button key={c.id} onClick={() => openEdit(c)} className="flex w-full items-center justify-between rounded-lg border border-ink/10 bg-white p-3 text-left hover:border-plum">
              <div>
                <div className="font-mono font-extrabold text-ink">{c.code}</div>
                <div className="text-xs text-ink/50">
                  {c.type === 'PERCENT_OFF' ? `${c.amount}% off` : c.type === 'FIXED_REDUCTION' ? `${formatPrice(c.amount ?? 0)} off` : 'Free'} · Used {c.usedCount} {c.usedCount === 1 ? 'time' : 'times'}
                  <br />{formatDiscountDay(c.validFrom)} to {formatDiscountDay(c.validTo)}
                  {c.scopeEvent && (
                    <><br />Only for {'deleted' in c.scopeEvent ? 'an event that has been deleted' : eventLabel(c.scopeEvent)}</>
                  )}
                  {!c.scopeEvent && c.scopeTheme && (
                    <><br />Only for {'deleted' in c.scopeTheme ? 'an event type that has been deleted' : `${c.scopeTheme.name} events`}</>
                  )}
                </div>
              </div>
              {status === 'expired' ? <Badge tone="muted">Expired</Badge>
                : noEvent ? <Badge tone="muted">No event</Badge>
                  : status === 'not-started' ? <Badge tone="plum">Starts {formatDiscountDay(c.validFrom)}</Badge>
                    : <Badge tone="green">Active</Badge>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
