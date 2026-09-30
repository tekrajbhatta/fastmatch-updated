'use client';

import {
  cloneElement, useId,
  type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';

// Form controls for the member-facing site (the redesign's style guide).
// Admin keeps its own in components/ui.tsx.
//
// Labels sit above fields, 15px bold, sentence case. Field border is
// #8A7E93 (3.8:1 on white). Focus = plum border + 4px lavender ring. Errors:
// red border + ring, the message below with an icon, and aria-invalid /
// aria-describedby on the control.

const CONTROL =
  'w-full rounded-field border-[1.5px] border-field bg-white text-base text-ink-900 transition-[border-color,box-shadow] ' +
  'hover:border-plum-700 focus:border-plum-700 focus:outline-none focus:ring-4 focus:ring-ring ' +
  'aria-[invalid=true]:border-error-700 aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-error-100 ' +
  'disabled:cursor-not-allowed disabled:border-dashed disabled:border-[#B9AFC1] disabled:bg-[#F4F1F5] disabled:text-[#6B6273]';

/**
 * Label + one control + optional hint and error. The control is given its
 * id, aria-describedby and aria-invalid here, so callers just pass it in.
 */
export function Field({
  label, hint, error, children, className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode | null;
  children: ReactElement;
  className?: string;
}) {
  const id = useId();
  const childProps = children.props as { id?: string; 'aria-describedby'?: string };
  const controlId = childProps.id ?? `${id}-control`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [childProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <label htmlFor={controlId} className="text-[15px] font-bold text-ink-900">{label}</label>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: controlId,
        'aria-describedby': describedBy,
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {hint && <p id={hintId} className="text-sm leading-snug text-ink-600">{hint}</p>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} h-[52px] px-4 ${className}`} />;
}

export function SelectInput({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={`${CONTROL} h-[52px] cursor-pointer appearance-none pl-4 pr-11 ${className}`}>
        {children}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-5 top-[18px] h-[9px] w-[9px] rotate-45 border-b-2 border-r-2 border-plum-700" />
    </span>
  );
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} min-h-[150px] resize-y px-4 py-3.5 leading-normal ${className}`} />;
}

/**
 * A real checkbox (keyboard, forms, `required` all behave natively) drawn as
 * the style guide's 26px box. The tick is always there in white, so it only
 * shows once the box fills plum.
 */
export function Checkbox({
  children, className = '', ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { children: ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${className}`}>
      <input type="checkbox" {...props} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="mt-px flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg border-[1.5px] border-field bg-white transition-colors peer-hover:border-plum-700 peer-checked:border-plum-700 peer-checked:bg-plum-700 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-plum-700 peer-disabled:opacity-50"
      >
        <span className="h-3 w-[7px] -translate-y-px rotate-45 border-b-[2.5px] border-r-[2.5px] border-white" />
      </span>
      <span className="text-[15px] leading-normal text-[#3E3548]">{children}</span>
    </label>
  );
}

/** Radio group drawn as side-by-side option tiles (Gender on sign up). */
export function RadioCards<T extends string>({
  legend, name, value, options, onChange, required, disabled,
}: {
  legend: ReactNode;
  name: string;
  value: T | '';
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[15px] font-bold text-ink-900">{legend}</legend>
      <div className="flex gap-2.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex h-[52px] min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-field border-[1.5px] border-field bg-white px-4 text-base font-semibold text-ink-900 transition-colors hover:border-plum-700 has-[:checked]:border-plum-700 has-[:checked]:bg-[#F3EDF9] has-[:checked]:font-bold has-[:checked]:text-plum-900 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-plum-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              required={required}
              disabled={disabled}
              className="peer sr-only"
            />
            <span aria-hidden="true" className="h-5 w-5 flex-none rounded-full border-[1.5px] border-field bg-white peer-checked:border-[6px] peer-checked:border-plum-700" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ErrorIcon() {
  return (
    <span aria-hidden="true" className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-error-700 text-xs font-extrabold text-white">!</span>
  );
}

/** The message under one field. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-2 text-sm font-semibold leading-snug text-error-700">
      <ErrorIcon />
      <span>{children}</span>
    </p>
  );
}

/** A message about the whole form (usually the API's own words). */
export function FormError({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div role="alert" className={`flex items-start gap-2 text-[15px] font-semibold leading-snug text-error-700 ${className}`}>
      <ErrorIcon />
      <div>{children}</div>
    </div>
  );
}

/** Confirmation that something worked. Lime fill under plum text. */
export function FormSuccess({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl bg-match-400/25 p-4 text-[15px] font-semibold leading-normal text-plum-900 ${className}`}>
      <span aria-hidden="true" className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-plum-900 text-sm font-extrabold text-match-300">✓</span>
      <div>{children}</div>
    </div>
  );
}

/** A neutral heads-up box (e.g. "please accept the terms"). */
export function Notice({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-plum-100 bg-plum-50 p-4 text-[15px] leading-normal text-ink-900 ${className}`}>{children}</div>
  );
}
