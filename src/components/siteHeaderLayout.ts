// The header's size, by audience. Lives outside SiteChrome (a client
// component) so the root layout — a server component — can put the
// --header-h variable on <html> for the first paint.
//
// The admin (ten items) and member (five) navs won't fit beside the logo
// on a tablet, so they collapse into the menu button later than the
// two-item public nav does — the admin one latest of all. The header's own
// height switches at the same point, so the compact header is always the one
// with the menu button.
//
// --header-h is the header's full height including its 1px bottom border:
// 69px compact, 89px full. Everything that has to clear the sticky header
// reads it — the homepage hero (100dvh minus the header), sticky panels'
// `top`, and the page's scroll-padding for anchors and keyboard focus.
//
// Full class strings, not interpolated fragments — Tailwind only generates
// classes it can find literally in the source (this folder is in its
// `content` paths; src/lib is not).
export function siteHeaderLayout(isLoggedIn: boolean, isAdmin: boolean) {
  return isAdmin
    ? { headerH: '[--header-h:69px] xl:[--header-h:89px]', nav: 'hidden xl:flex', burger: 'xl:hidden', logo: 'w-[150px] xl:w-[200px]', links: 'gap-5 text-[15px]' }
    : isLoggedIn
      ? { headerH: '[--header-h:69px] lg:[--header-h:89px]', nav: 'hidden lg:flex', burger: 'lg:hidden', logo: 'w-[150px] lg:w-[200px]', links: 'gap-8 text-base' }
      : { headerH: '[--header-h:69px] md:[--header-h:89px]', nav: 'hidden md:flex', burger: 'md:hidden', logo: 'w-[150px] md:w-[200px]', links: 'gap-8 text-base' };
}
