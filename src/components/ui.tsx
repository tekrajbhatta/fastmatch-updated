import { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { Spinner } from '@/components/Spinner';

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string | null }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink/50">{label}</label>
      {children}
      {/* What's wrong with this box, right under it. */}
      {error && <p role="alert" className="mt-1 text-xs font-medium text-coral">{error}</p>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-plum ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-plum ${props.className ?? ''}`}
    />
  );
}

export function Button({
  variant = 'primary',
  className = '',
  loading = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean }) {
  // `loading` adds a spinner beside the label while the action runs.
  // Disabled-while-busy is still up to the caller, as before.
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-40';
  const styles = {
    primary: 'bg-coral text-white hover:bg-coral/90',
    ghost: 'border border-plum text-plum hover:bg-plum/5',
    danger: 'border border-coral text-coral hover:bg-coral/5',
  };
  return (
    <button {...props} aria-busy={loading || undefined} className={`${base} ${styles[variant]} ${className}`}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/**
 * "← Back to …" at the top of an admin page, to the page it sits under.
 * Padded to a comfortable tap size for phones without looking any bigger.
 */
export function BackLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`-ml-1 mb-1 inline-flex min-h-[40px] items-center gap-1 rounded px-1 text-sm font-bold text-plum hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-plum ${className}`}>
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
}

/** A page's or panel's content while it loads (admin styling). */
export function Loader({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-3 py-12 text-sm font-semibold text-ink/60 ${className}`}>
      <Spinner className="h-6 w-6 text-plum" />
      <span>{label}</span>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-ink/10 bg-white p-5 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'plum' | 'muted' }) {
  const styles = {
    green: 'bg-green/15 text-green-dark',
    plum: 'bg-plum/10 text-plum',
    muted: 'bg-ink/5 text-ink/50',
  };
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${styles[tone]}`}>{children}</span>;
}
