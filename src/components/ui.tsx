import { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink/50">{label}</label>
      {children}
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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-40';
  const styles = {
    primary: 'bg-coral text-white hover:bg-coral/90',
    ghost: 'border border-plum text-plum hover:bg-plum/5',
    danger: 'border border-coral text-coral hover:bg-coral/5',
  };
  return <button {...props} className={`${base} ${styles[variant]} ${className}`} />;
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
