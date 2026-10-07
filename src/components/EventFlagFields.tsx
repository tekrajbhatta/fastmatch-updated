'use client';

import { GROUP_DISCOUNT_PER_FRIEND } from '@/lib/bookingPrice';
import { RATING_AUDIENCE_OPTIONS, type RatingAudience } from '@/lib/ratingAudience';

export interface EventFlags {
  confirmed: boolean;
  fastmatchDiscounts: boolean;
  groupDiscounts: boolean;
  ratingAudience: RatingAudience;
}

/**
 * The event's on/off options, shared by the New event and Edit event forms so
 * the two always offer the same choices.
 */
export default function EventFlagFields({ value, onChange }: { value: EventFlags; onChange: (patch: Partial<EventFlags>) => void }) {
  return (
    <>
      <Option
        checked={value.confirmed}
        onChange={(v) => onChange({ confirmed: v })}
        label="Event confirmed"
        hint="Tick once the venue is locked in and enough people are coming. Shows yellow instead of orange on the events list in its final week."
      />
      <Option
        checked={value.fastmatchDiscounts}
        onChange={(v) => onChange({ fastmatchDiscounts: v })}
        label="FastMatch Discounts"
        hint="Shows the discount code box on the event page. Untick to stop codes being used for this event."
      />
      <Option
        checked={value.groupDiscounts}
        onChange={(v) => onChange({ groupDiscounts: v })}
        label="Group Discounts"
        hint={`Lets members bring friends when they book, with $${GROUP_DISCOUNT_PER_FRIEND} off for each friend.`}
      />
      {/* Who appears on each member's check-in list, to rate (Gil). */}
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-sm font-semibold text-ink">On the night, members see and rate</legend>
        {RATING_AUDIENCE_OPTIONS.map((o) => (
          <label key={o.value} className="mb-2 flex items-start gap-2 text-sm font-semibold text-ink">
            <input type="radio" name="ratingAudience" className="mt-0.5" checked={value.ratingAudience === o.value} onChange={() => onChange({ ratingAudience: o.value })} />
            <span>
              {o.label}
              <span className="block text-xs font-normal text-ink/50">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

function Option({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="mb-4 flex items-start gap-2 text-sm font-semibold text-ink">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        <span className="block text-xs font-normal text-ink/50">{hint}</span>
      </span>
    </label>
  );
}
