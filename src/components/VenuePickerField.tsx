'use client';

import { useState, useEffect } from 'react';
import { Field, Select, Button } from '@/components/ui';
import { venueFill, venueWouldReplace } from '@/lib/campaigns/blastFill';

interface Venue {
  id: string; name: string; address: string | null; phone: string | null;
  websiteUrl: string | null; imageUrl: string | null; logoUrl: string | null; description: string | null;
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
 * What goes where is venueFill (src/lib/campaigns/blastFill.ts): the
 * address and contact details into Event details, the description into Free
 * text (Gil, item 1), the image as the photo and the logo under the details.
 *
 * Because it overwrites, it asks first when a field it would replace already
 * has content — picking the wrong venue shouldn't silently discard copy.
 */
export default function VenuePickerField({
  onApply,
  current,
}: {
  onApply: (patch: { eventDetailsText: string; freeText?: string; photoUrl?: string; venueLogoUrl: string }) => void;
  /** What the blast holds now, to ask before replacing any of it. */
  current: { eventDetailsText: string; freeText: string; photoUrl: string };
}) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pending, setPending] = useState<Venue | null>(null);

  useEffect(() => {
    fetch('/api/admin/venues').then((r) => r.json()).then(setVenues);
  }, []);

  // The fields this venue would replace that already hold something.
  const wouldReplace = (v: Venue) => venueWouldReplace(v, current);

  function apply(v: Venue) {
    onApply(venueFill(v));
    setPending(null);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    const v = venues.find((x) => x.id === id);
    if (!v) return;
    if (wouldReplace(v).length) setPending(v);
    else apply(v);
  }

  return (
    <Field label="Fill from a venue">
      <Select value={selectedId} onChange={(e) => handleSelect(e.target.value)}>
        <option value="">Select a venue…</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>{v.name}, {v.city.name}</option>
        ))}
      </Select>

      {pending ? (
        <div className="mt-2 rounded-lg bg-cream/60 p-3 text-sm">
          <p className="mb-2 text-ink">
            Replace the {listOf(wouldReplace(pending))} with <strong>{pending.name}</strong>&apos;s?
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => apply(pending)}>Replace</Button>
            <Button type="button" variant="ghost" onClick={() => { setPending(null); setSelectedId(''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink/50">
          Copies the venue&apos;s name, address, phone and website into Event details, its description into Free text,
          and its image and logo. Edit freely afterwards. Changing the venue later won&apos;t alter this blast.
        </p>
      )}
    </Field>
  );
}

/** "event details, free text and photo" */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
