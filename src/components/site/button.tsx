import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';

// Buttons for the member-facing site (the redesign's style guide). Admin
// keeps its own in components/ui.tsx.
//
// Primary (coral) is the one main action per view; secondary is the plum
// outline; `light` is the white outline used on plum panels. Always pill
// shaped. Heights: hero 56 · forms 54 · header 44 · sm 36 (table rows).
// Disabled uses a neutral fill so it can't be mistaken for a pale primary.

export type ButtonVariant = 'primary' | 'secondary' | 'light';
export type ButtonSize = 'hero' | 'form' | 'header' | 'sm';

interface ButtonStyle {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  /** Sitting on a plum panel: the focus outline turns lime so it stays visible. */
  onDark?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-coral-600 text-white shadow-cta hover:bg-coral-700 disabled:bg-[#E9E4EC] disabled:text-[#6B6273] disabled:shadow-none',
  secondary:
    'border-[1.5px] border-plum-700 text-plum-700 hover:bg-plum-700 hover:text-white disabled:border-[#B9AFC1] disabled:bg-transparent disabled:text-[#6B6273]',
  light: 'border-[1.5px] border-white/90 text-white hover:bg-white hover:text-plum-900',
};

const SIZES: Record<ButtonSize, string> = {
  hero: 'h-14 px-7 text-[17px]',
  form: 'h-[54px] px-7 text-[17px]',
  header: 'h-11 px-5 text-base',
  sm: 'h-9 px-4 text-sm',
};

export function buttonClass({ variant = 'primary', size = 'form', block = false, onDark = false }: ButtonStyle = {}) {
  return [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-center font-bold transition-colors',
    'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] disabled:cursor-not-allowed',
    onDark ? 'focus-visible:outline-match-400' : 'focus-visible:outline-plum-700',
    VARIANTS[variant],
    SIZES[size],
    block ? 'w-full' : '',
  ].join(' ');
}

/** A <button>. Like a plain button it has no default `type` — pass
    type="submit" or type="button" as the place needs. */
export function Button({
  variant, size, block, onDark, className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle) {
  return <button {...props} className={`${buttonClass({ variant, size, block, onDark })} ${className}`} />;
}

/** A link that looks like a button. */
export function ButtonLink({
  variant, size, block, onDark, className = '', ...props
}: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link {...props} className={`${buttonClass({ variant, size, block, onDark })} ${className}`} />;
}

/** Inline text link on a light background. */
export const linkClass =
  'rounded-sm font-bold text-plum-700 underline underline-offset-[3px] hover:text-plum-900 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-plum-700';

/** Inline text link on a plum panel. */
export const linkOnDarkClass =
  'rounded-sm font-bold text-match-300 underline underline-offset-[3px] hover:text-white focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-match-400';
