// Loading indicators shared by the member site and admin. Colour comes from
// the surrounding text (currentColor) unless a class says otherwise, so the
// same spinner works inside a coral button, on plum, or in admin's palette.

/** A small spinning ring. Decorative: pair it with visible text or an aria-label on its container. */
export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      // Still turns with reduced motion — it's the only sign something is
      // happening — just more slowly.
      className={`shrink-0 animate-spin motion-reduce:animate-[spin_1.6s_linear_infinite] ${className}`}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A progress bar. With `value` and `max` it fills to that fraction; without
 * them it's indeterminate (a sliding stripe) for work whose progress can't be
 * measured yet.
 */
export function ProgressBar({
  value, max, label, trackClassName = 'bg-plum/10', barClassName = 'bg-plum',
}: {
  value?: number;
  max?: number;
  /** Accessible name, e.g. "Blast sending progress". */
  label: string;
  trackClassName?: string;
  barClassName?: string;
}) {
  const determinate = value !== undefined && max !== undefined && max > 0;
  const pct = determinate ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
      className={`relative h-2.5 w-full overflow-hidden rounded-full ${trackClassName}`}
    >
      {determinate ? (
        <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${barClassName}`} style={{ width: `${pct}%` }} />
      ) : (
        <div className={`absolute inset-y-0 left-0 w-2/5 rounded-full animate-indeterminate motion-reduce:animate-none motion-reduce:w-full motion-reduce:opacity-60 ${barClassName}`} />
      )}
    </div>
  );
}
