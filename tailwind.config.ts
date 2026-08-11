import type { Config } from 'tailwindcss';
import { BRAND_COLORS } from './src/lib/brand';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: BRAND_COLORS.ink,
        plum: BRAND_COLORS.plum,
        'plum-dark': BRAND_COLORS.plumDark,
        green: BRAND_COLORS.green,
        'green-dark': BRAND_COLORS.greenDark,
        amber: BRAND_COLORS.amber,
        coral: BRAND_COLORS.redCta,
        cream: BRAND_COLORS.cream,
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
