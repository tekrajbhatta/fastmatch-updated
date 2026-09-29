'use client';

import { GROUP_DISCOUNT_PER_FRIEND } from '@/lib/bookingPrice';

export interface EventFlags {
  confirmed: boolean;
  fastmatchDiscounts: boolean;
  groupDiscounts: boolean;
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
