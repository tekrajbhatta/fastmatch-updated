import type { Metadata } from 'next';
import Image from 'next/image';
import { getCurrentMember } from '@/lib/auth';
import { Container, DecorDisc, DecorRing } from '@/components/site/layout';
import { ButtonLink } from '@/components/site/button';

// The public homepage. `/` previously did `redirect('/events')`, which dropped
// first-time visitors straight into a booking list with no explanation of what
// FastMatch is. Photos are the client's own event photography.
export const metadata: Metadata = {
  title: "FastMatch — Australia's original speed dating, since 1999",
  description:
    'Real conversations. Real people. Real matches. Five minutes face to face could change your life — speed dating events across Australia since 1999.',
};

// "What a night actually looks like": a row of tilted polaroids that
// straighten on hover. Full class strings, so Tailwind can find them.
const NIGHT_PHOTOS = [
  { photo: 'p6_greens_floral', alt: 'Couple chatting across a table at a FastMatch night', tilt: '-rotate-2' },
  { photo: 'p1_white_dress', alt: 'Woman laughing during a speed date', tilt: 'rotate-[1.5deg] translate-y-2.5' },
  { photo: 'p7_formal_event', alt: 'Pairs talking at long tables', tilt: 'rotate-[-1.5deg]' },
  { photo: 'p4_pink_shirt', alt: 'Woman smiling at her date', tilt: 'rotate-2 translate-y-2.5' },
];

export default async function HomePage() {
  // getCurrentMember() is cache()'d, so asking again here costs nothing on
  // top of the root layout's own lookup for the header.
  const member = await getCurrentMember();
  const isLoggedIn = member !== null;

  return (
    <>
      {/* Hero. Phones: the photo is a band across the top that fades into the
          plum under the text. Wider: it fills the right 62%, faded in from
          the left behind the text. */}
      <section className="relative overflow-hidden bg-plum-900">
        {/* The mask fades the photo's left edge in, so its bright background
            doesn't leave a visible seam where it meets the solid plum. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[300px] md:inset-y-0 md:left-auto md:h-auto md:w-[62%] md:[mask-image:linear-gradient(90deg,transparent,black_18%)]">
          {/* Decorative — the headline beside it carries the meaning, so alt is
              intentionally empty rather than describing the photo to a screen
              reader that has just read the same message. */}
          <Image
            src="/photos/p3_greens_omar.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 62vw, 100vw"
            className="object-cover object-[60%_center] md:object-right"
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(45,24,72,0.1)_0px,rgba(45,24,72,0.65)_170px,#2D1848_290px)] md:bg-[linear-gradient(90deg,#2D1848_36%,rgba(45,24,72,0.55)_64%,rgba(45,24,72,0.05)_100%)]"
        />
        <Container className="relative pb-[clamp(56px,9vw,136px)] pt-[clamp(40px,8vw,120px)]">
          {/* Room for the photo above the text on phones. */}
          <div className="h-40 md:hidden" />
          <div className="flex max-w-[620px] flex-col items-start gap-[clamp(20px,2vw,28px)]">
            <span className="inline-block rounded-[999px_999px_999px_4px] bg-match-400 px-3.5 py-2 text-[clamp(11px,0.9vw,13px)] font-extrabold uppercase leading-[1.3] tracking-[0.08em] text-plum-900">
              Australia&apos;s original speed dating pioneers
            </span>
            <h1 className="font-display text-[clamp(46px,6.2vw,90px)] font-extrabold leading-[0.96] tracking-[-0.035em] text-white">
              Real conversations.<br />Real people.<br /><span className="text-match-300">Real matches.</span>
            </h1>
            <p className="max-w-[540px] text-[clamp(17px,1.4vw,20px)] leading-[1.55] text-plum-200 text-pretty">
              Five minutes face to face could change your life. We pioneered this phenomenon in 1999
              and still today nobody knows speed dating better!
            </p>
            <div className="mt-2 flex w-full max-w-[440px] flex-wrap gap-3">
              {/* On its own (logged in) it keeps the width it has beside
                  "Sign up free" rather than stretching across the row. */}
              <ButtonLink href="/events" size="hero" onDark className={isLoggedIn ? 'flex-[0_1_214px]' : 'flex-[1_1_180px]'}>
                Browse events
              </ButtonLink>
              {/* Nothing to sign up for once you're in — shown only to visitors
                  who don't already have an account. */}
              {!isLoggedIn && (
                <ButtonLink href="/register" variant="light" size="hero" onDark className="flex-[1_1_180px]">
                  Sign up free
                </ButtonLink>
              )}
            </div>
          </div>
        </Container>
      </section>

      {/* How it works — explainer video + the real 6-step flow */}
      <section className="bg-cream-50 py-[clamp(64px,7.8vw,112px)]">
        <Container>
          <h2 className="mb-[clamp(28px,3.3vw,48px)] font-display text-[clamp(34px,3.9vw,56px)] font-extrabold leading-none tracking-[-0.03em] text-ink-900">
            How it works
          </h2>

          <div className="flex flex-wrap items-start gap-[clamp(40px,4.4vw,64px)]">
            {/* mr-3.5 leaves room for the lime backing, offset 14px down and right. */}
            <div className="relative mr-3.5 min-w-0 flex-[1_1_520px]">
              <div aria-hidden="true" className="absolute -bottom-3.5 -right-3.5 left-3.5 top-3.5 rounded-[32px_32px_32px_8px] bg-match-400" />
              <div className="relative aspect-video overflow-hidden rounded-[32px_32px_32px_8px] bg-plum-950">
                {/* loading="lazy" — the video sits below the fold, so this keeps
                    YouTube's player off the critical path for the hero. */}
                <iframe
                  className="absolute inset-0 h-full w-full border-0"
                  // cc_load_policy=0 asks YouTube not to turn captions on by
                  // default — they were appearing over the animation on play.
                  // A viewer whose own YouTube account forces captions on will
                  // still see them; that preference is theirs, not ours to override.
                  src="https://www.youtube.com/embed/t3iolGRru9Y?rel=0&cc_load_policy=0"
                  title="How FastMatch speed dating works"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>

            <ol className="flex min-w-0 flex-[1_1_380px] flex-col gap-[clamp(20px,1.9vw,26px)]">
              <Step n={1} title="Register for free" body="Validate your email and mobile, and complete your profile." />
              <Step n={2} title="Search our upcoming events" body="Find one for your age group and location." />
              <Step n={3} title="Book and pay" body="Receive your confirmation and get ready for a fun night." />
              <Step n={4} title="Arrive at the venue early" body="Scan the QR code on arrival and take your seat." />
              <Step
                n={5}
                title="Start your 5-minute conversations"
                body="Meet each person in the room and rate who you'd like to see again — Date, Friend, or No — it's quick and private, all on your phone."
              />
              <Step
                n={6}
                title="Receive your matches automatically"
                body="At the end of the event, get your matches on your phone — if it's mutual, you'll both get each other's contact details."
              />
            </ol>
          </div>
        </Container>
      </section>

      {/* Photo strip */}
      <section className="bg-cream-100 pb-[clamp(56px,5.5vw,80px)] pt-[clamp(64px,7.8vw,112px)]">
        <Container>
          <h2 className="mb-[clamp(32px,3.9vw,56px)] text-center font-display text-[clamp(32px,3.9vw,56px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-900 text-balance">
            What a night actually looks like
          </h2>
          {/* Four across; below ~640px of room they drop to 140px minimum,
              which is two across on a phone. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(max(140px,calc((100%_-_84px)_/_4)),1fr))] gap-[clamp(16px,2vw,28px)]">
            {NIGHT_PHOTOS.map(({ photo, alt, tilt }) => (
              <figure
                key={photo}
                className={`rounded-[18px] bg-white p-[clamp(6px,0.7vw,10px)] shadow-photo transition-transform duration-[250ms] ease-[ease] hover:translate-y-0 hover:rotate-0 hover:scale-[1.03] motion-reduce:transition-none ${tilt}`}
              >
                <div className="relative aspect-square overflow-hidden rounded-xl">
                  {/* The photos are landscape and shown square, so the source
                      needs ~1.5× the box's width to fill its height sharply. */}
                  <Image
                    src={`/photos/${photo}.jpg`}
                    alt={alt}
                    fill
                    sizes="(min-width: 1264px) 390px, (min-width: 700px) 33vw, 64vw"
                    className="object-cover"
                  />
                </div>
              </figure>
            ))}
          </div>
        </Container>
      </section>

      {/* Closing CTA */}
      <section className="bg-cream-100 pb-[clamp(64px,7.8vw,112px)] pt-[clamp(24px,2.8vw,40px)]">
        <Container>
          <div className="relative flex flex-col items-center gap-[18px] overflow-hidden rounded-[clamp(28px,3.3vw,48px)_clamp(28px,3.3vw,48px)_clamp(28px,3.3vw,48px)_10px] bg-plum-900 px-[clamp(24px,4.4vw,64px)] py-[clamp(48px,6vw,88px)] text-center">
            <DecorRing className="right-[clamp(-120px,-6vw,-60px)] top-[clamp(-150px,-8vw,-80px)] w-[clamp(180px,22vw,320px)] opacity-60" />
            <DecorDisc className="bottom-[clamp(-110px,-6vw,-60px)] left-[clamp(-80px,-4vw,-40px)] w-[clamp(140px,16vw,240px)]" />
            <h2 className="relative max-w-[760px] font-display text-[clamp(30px,3.6vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white text-balance">
              Five minutes with someone could change your life.
            </h2>
            <p className="relative text-[clamp(17px,1.3vw,19px)] leading-normal text-plum-200">Search for events in your location now!</p>
            <ButtonLink href="/events" size="hero" onDark className="relative mt-2.5">
              See upcoming events
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex items-start gap-[18px]">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[22px_22px_22px_6px] bg-plum-900 font-display text-lg font-extrabold text-match-300">
        {n}
      </span>
      <div className="pt-0.5">
        <h3 className="mb-1 text-lg font-extrabold leading-[1.3] text-ink-900">{title}</h3>
        <p className="text-base leading-[1.55] text-ink-600 text-pretty">{body}</p>
      </div>
    </li>
  );
}
