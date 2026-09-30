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

// The member-facing redesign's palette, from its style guide. Tailwind
// exposes these as numbered shades next to the colours
// above — `plum` stays #3D1E6D for the admin screens while `plum-900` is the
// redesign's plum — so the public site can move to the new palette without
// repainting admin. Every text pair the redesign uses meets WCAG AA; lime
// (match-400) is never text on a light background, only a fill or text on plum.
export const SITE_PALETTE = {
  plum: { 50: "#F8F4FB", 100: "#EFE8F7", 200: "#D9CCEA", 700: "#4A2A6E", 900: "#2D1848", 950: "#1F1233" },
  match: { 300: "#C4E26A", 400: "#A4CE39" },
  coral: { 600: "#D23B2A", 700: "#B32F20" },
  cream: { 50: "#FCF9F5", 100: "#F4ECE2" },
  ink: { 500: "#736879", 600: "#5C5266", 900: "#221A2B" },
  field: "#8A7E93", // input and checkbox borders (3.8:1 on white)
  line: "#EDE6DD", // card borders and dividers
  ring: "#E4D9F2", // focus ring around inputs
  error: { 100: "#FDE3DF", 700: "#B42318" },
};
