// Single source of truth for fastmatch.com.au's brand identity — the
// business name, tagline, and colors. Everywhere else (emails, and any
// Tailwind config once the UI pages are built) should read from here
// instead of having the name or hex values hardcoded in multiple places.
// A rebrand (new tagline, new palette) becomes a change in this one file.
//
// Emails need raw hex (HTML email can't reference Tailwind classes), so
// BRAND_COLORS is exported as plain hex strings usable both by a future
// tailwind.config.ts (as the actual class values) and directly in email
// template strings — same approach as FastmatchLive's brand.ts.

export const BRAND_NAME = "fastmatch";
export const BRAND_TAGLINE = "Connecting People Face to Face";

export const BRAND_COLORS = {
  ink: "#2B2630",
  plum: "#3D1E6D", // primary brand color — the deep purple from the real logo
  plumDark: "#2E1558",
  green: "#A4CE39", // the lighter yellow-green from the real logo
  greenDark: "#7A9A2E",
  amber: "#D98A1E", // Friend-match accent, used sparingly
  redCta: "#E1382E", // call-to-action buttons (Login, Sign Up, Book Now — matches the real site)
  cream: "#F1E9F8",
};
