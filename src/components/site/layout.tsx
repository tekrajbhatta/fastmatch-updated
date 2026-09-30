import type { ReactNode } from 'react';

// Page scaffolding for the member-facing site (the redesign). Every member
// page is full width (SiteChrome gives it a bare <main>) and lays itself out
// with these.
//
// Sizes use clamp(min, N·vw, max) so type and spacing scale smoothly between
// the 375px phone and 1440px desktop designs rather than jumping at breakpoints.

/** The site's content width: 1200px of content inside 20–32px gutters. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1264px] px-[clamp(20px,2.2vw,32px)] ${className}`}>{children}</div>;
}

/** Decorative outline circle (lime) for plum panels. */
export function DecorRing({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute aspect-square rounded-full border-2 border-match-400 ${className}`} />;
}

/** Decorative soft disc for plum panels. */
export function DecorDisc({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute aspect-square rounded-full bg-plum-200/10 ${className}`} />;
}

/**
 * The plum band a page opens with (Upcoming Events, an event's page, …):
 * optional lime eyebrow, the page's <h1>, a lead line. `aside` sits to the
 * right of the text (an event's venue logo); `children` go under the lead.
 */
export function PageHero({
  eyebrow, title, lead, aside, children, size = 'page',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  /** 'event' is the event page's larger title. */
  size?: 'page' | 'event';
}) {
  const event = size === 'event';
  return (
    <section className="relative overflow-hidden bg-plum-900">
      <DecorRing className="bottom-[clamp(-150px,-8vw,-90px)] right-[clamp(-60px,6vw,140px)] w-[clamp(160px,20vw,300px)] opacity-60" />
      <Container className={`relative pb-[clamp(36px,4.4vw,64px)] ${event ? 'pt-[clamp(36px,5vw,72px)]' : 'pt-[clamp(40px,5vw,72px)]'}`}>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[clamp(12px,1vw,14px)] font-extrabold uppercase tracking-[0.1em] text-match-300">{eyebrow}</p>
            )}
            <h1
              className={`font-display font-extrabold leading-none text-white ${
                event ? 'text-[clamp(44px,5vw,72px)] tracking-[-0.035em]' : 'text-[clamp(40px,4.4vw,64px)] tracking-[-0.03em]'
              } ${eyebrow ? 'mt-3' : ''}`}
            >
              {title}
            </h1>
            {lead && (
              <p
                className={`text-[clamp(17px,1.4vw,20px)] text-plum-200 text-pretty ${
                  event ? 'mt-3.5 max-w-[640px] leading-[1.45]' : 'mt-3 leading-normal'
                }`}
              >
                {lead}
              </p>
            )}
            {children}
          </div>
          {aside}
        </div>
      </Container>
    </section>
  );
}

/**
 * Two panels, as on Log in / Contact us / Sign up: the page title on plum
 * at the left, the form on cream at the right. They stack (title first)
 * once there isn't room for both, around 1000px.
 */
export function SplitLayout({
  title, lead, intro, children, stickyIntro = false,
}: {
  title: ReactNode;
  lead?: ReactNode;
  /** Anything else for the plum panel, under the lead. */
  intro?: ReactNode;
  /** The form side. */
  children: ReactNode;
  /** Keep the title in view beside a long form (Sign up). */
  stickyIntro?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-wrap">
      {/* overflow-clip rather than hidden: it trims the circles without
          becoming a scroll container, which would switch `sticky` off. */}
      <section className="relative flex-[1_1_480px] overflow-clip bg-plum-900 pb-[clamp(48px,7.2vw,104px)] pl-[max(20px,calc(50vw-568px))] pr-[clamp(20px,4.4vw,64px)] pt-[clamp(40px,7.2vw,104px)]">
        <DecorRing className="bottom-[clamp(-110px,-6vw,-60px)] right-[clamp(-60px,-2vw,-20px)] w-[clamp(150px,22vw,320px)] opacity-70" />
        <DecorDisc className="bottom-[clamp(-110px,-6vw,-60px)] right-[clamp(50px,11vw,160px)] w-[clamp(150px,22vw,320px)]" />
        <div className={`relative max-w-[460px] ${stickyIntro ? 'sticky top-10' : ''}`}>
          <h1 className="font-display text-[clamp(40px,5vw,72px)] font-extrabold leading-none tracking-[-0.035em] text-white">{title}</h1>
          {lead && <p className="mt-4 text-[clamp(17px,1.4vw,20px)] leading-normal text-plum-200 text-pretty">{lead}</p>}
          {intro}
        </div>
      </section>
      <section className="flex flex-[1_1_520px] items-start justify-center bg-cream-50 pb-[clamp(56px,6.7vw,96px)] pl-[clamp(16px,4.4vw,64px)] pr-[max(16px,calc(50vw-568px))] pt-[clamp(24px,5vw,72px)]">
        {children}
      </section>
    </div>
  );
}

/** The white form card on the right of a SplitLayout. */
export function FormCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex w-full max-w-[480px] flex-col gap-5 rounded-[28px] border border-line bg-white p-[clamp(24px,2.8vw,40px)] shadow-panel ${className}`}>
      {children}
    </div>
  );
}

/** A plain content card. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-white p-[clamp(20px,1.8vw,26px)] ${className}`}>{children}</div>;
}

/** Theme / category tag: speech-bubble pill. */
export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-block self-start rounded-[999px_999px_999px_4px] bg-plum-100 px-3 py-[5px] text-[13px] font-bold leading-[1.3] text-plum-700 ${className}`}>
      {children}
    </span>
  );
}

/** "Loading…" and similar one-liners while data arrives. */
export function LoadingNote({ children = 'Loading…', className = '' }: { children?: ReactNode; className?: string }) {
  return <p role="status" className={`text-[15px] text-ink-600 ${className}`}>{children}</p>;
}

/** Section heading inside a page body (e.g. "Looking at events in Sydney"). */
export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`font-display text-[clamp(26px,2.4vw,34px)] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-900 ${className}`}>
      {children}
    </h2>
  );
}
