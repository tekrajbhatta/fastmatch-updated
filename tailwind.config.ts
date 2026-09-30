import type { Config } from 'tailwindcss';
import { BRAND_COLORS, SITE_PALETTE } from './src/lib/brand';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The original single colours stay as each family's DEFAULT, so every
        // existing class (text-plum, bg-cream/50, bg-coral …) renders exactly
        // as before on the admin screens. The numbered shades are the
        // member-facing redesign's palette.
        ink: { DEFAULT: BRAND_COLORS.ink, ...SITE_PALETTE.ink },
        plum: { DEFAULT: BRAND_COLORS.plum, ...SITE_PALETTE.plum },
        'plum-dark': BRAND_COLORS.plumDark,
        green: BRAND_COLORS.green,
        'green-dark': BRAND_COLORS.greenDark,
        amber: BRAND_COLORS.amber,
        coral: { DEFAULT: BRAND_COLORS.redCta, ...SITE_PALETTE.coral },
        cream: { DEFAULT: BRAND_COLORS.cream, ...SITE_PALETTE.cream },
        match: SITE_PALETTE.match,
        field: SITE_PALETTE.field,
        line: SITE_PALETTE.line,
        ring: SITE_PALETTE.ring,
        error: SITE_PALETTE.error,
      },
      fontFamily: {
        // Both loaded with next/font in the root layout.
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        field: '14px',
        card: '24px',
        // One tight corner: a speech bubble, the brand's signature shape.
        bubble: '28px 28px 28px 6px',
      },
      boxShadow: {
        card: '0 18px 36px -22px rgb(45 24 72 / .45)',
        cta: '0 10px 24px -14px rgb(210 59 42 / .9)',
        panel: '0 24px 48px -30px rgb(45 24 72 / .4)',
        photo: '0 14px 30px -18px rgb(45 24 72 / .5)',
      },
    },
  },
  plugins: [],
};

export default config;
