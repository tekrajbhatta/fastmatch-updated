'use client';

import { useState, useEffect } from 'react';
import { Field, Select, Button } from '@/components/ui';
import { venueBlock } from '@/lib/venue';

interface Venue {
  id: string; name: string; address: string | null; phone: string | null;
  websiteUrl: string | null;
  city: { id: string; name: string };
}

/**
 * "Pick a venue" on the blast form.
 *
 * COPIES the venue's details into this blast's own fields rather than storing
 * a reference to it. The blast then owns its text: editing the venue later
 * can't rewrite a blast that has already been written and proofread, and Gil
 * can tweak the wording for one blast without affecting any other. This
 * matches how selecting a blast template already behaves.
 *
 * Text only — the photo is no longer part of a venue, so the blast's own
 * photo upload below is the only place a blast image comes from.
 *
 * Because it overwrites, it asks first when the target field already has
 * content — picking the wrong venue shouldn't silently discard copy.
 */
export default function VenuePickerField({
  onApply,
  hasExistingContent,
}: {
  onApply: (patch: { eventDetailsText: string }) => void;
  /** True when the event details field already holds something worth protecting. */
  hasExistingContent: boolean;
}) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pending, setPending] = useState<Venue | null>(null);

  useEffect(() => {
    fetch('/api/admin/venues').then((r) => r.json()).then(setVenues);
  }, []);

  function apply(v: Venue) {
    onApply({ eventDetailsText: venueBlock(v) });
    setPending(null);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    const v = venues.find((x) => x.id === id);
    if (!v) return;
    if (hasExistingContent) setPending(v);
    else apply(v);
  }

  return (
    <Field label="Fill from a venue">
      <Select value={selectedId} onChange={(e) => handleSelect(e.target.value)}>
        <option value="">Select a venue…</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>{v.name} — {v.city.name}</option>
        ))}
      </Select>

      {pending ? (
        <div className="mt-2 rounded-lg bg-cream/60 p-3 text-sm">
          <p className="mb-2 text-ink">
            Replace the event details with <strong>{pending.name}</strong>&apos;s?
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => apply(pending)}>Replace</Button>
            <Button type="button" variant="ghost" onClick={() => { setPending(null); setSelectedId(''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink/50">
          Copies the venue&apos;s name, address, phone and website into this blast. Edit freely
          afterwards — changing the venue later won&apos;t alter this blast.
        </p>
      )}
    </Field>
  );
}
