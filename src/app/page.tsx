import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getCurrentMember } from '@/lib/auth';

// The public homepage. `/` previously did `redirect('/events')`, which dropped
// first-time visitors straight into a booking list with no explanation of what
// FastMatch is. Photos are the client's own event photography.
export const metadata: Metadata = {
  title: "FastMatch — Australia's original speed dating, since 1999",
  description:
    'Real conversations. Real people. Real matches. Five minutes face to face could change your life — speed dating events across Australia since 1999.',
};

export default async function HomePage() {
  // getCurrentMember() is cache()'d, so asking again here costs nothing on
  // top of the root layout's own lookup for the header.
  const member = await getCurrentMember();
  const isLoggedIn = member !== null;

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[480px] items-center overflow-hidden bg-plum">
        <div className="absolute inset-0">
          {/* Decorative — the headline beside it carries the meaning, so alt is
              intentionally empty rather than describing the photo to a screen
              reader that has just read the same message. */}
          <Image src="/photos/p3_greens_omar.jpg" alt="" fill priority className="object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-plum via-plum/70 to-plum/40" />
        </div>
        <div className="relative mx-auto w-full max-w-6xl px-5 py-16 text-white">
          <span className="mb-4 inline-block rounded-full bg-green px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-plum-dark">
            Australia&apos;s original speed dating pioneers
          </span>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Real conversations. <br />Real people. <br />Real matches.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/85">
            Five minutes face to face could change your life. We pioneered this phenomenon in 1999
            and still today nobody knows speed dating better!
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/events" className="rounded-lg bg-coral px-6 py-3 font-extrabold text-white hover:bg-coral/90">
              Browse events
            </Link>
            {/* Nothing to sign up for once you're in — shown only to visitors
                who don't already have an account. */}
            {!isLoggedIn && (
              <Link href="/register" className="rounded-lg border-2 border-white px-6 py-3 font-extrabold text-white hover:bg-white/10">
                Sign up free
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* How it works — explainer video + the real 6-step flow */}
      <section className="bg-cream/40 py-16">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="mb-8 text-center text-3xl font-extrabold text-ink">How it works</h2>

          <div className="mb-10 aspect-video overflow-hidden rounded-xl shadow-lg">
            {/* loading="lazy" — the video sits below the fold, so this keeps
                YouTube's player off the critical path for the hero. */}
            <iframe
              className="h-full w-full"
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

          <ol className="space-y-6 text-left">
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
      </section>

      {/* Photo strip */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="mb-8 text-center text-3xl font-extrabold text-ink">What a night actually looks like</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {['p6_greens_floral', 'p1_white_dress', 'p7_formal_event', 'p4_pink_shirt'].map((photo) => (
              <div key={photo} className="aspect-square overflow-hidden rounded-lg">
                <Image
                  src={`/photos/${photo}.jpg`}
                  alt=""
                  width={300}
                  height={300}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-plum py-16 text-center text-white">
        <div className="mx-auto max-w-2xl px-5">
          <h2 className="text-3xl font-extrabold">Five minutes with someone could change your life.</h2>
          <p className="mt-3 text-white/80">Search for events in your location now!</p>
          <Link
            href="/events"
            className="mt-6 inline-block rounded-lg bg-coral px-8 py-3.5 font-extrabold text-white hover:bg-coral/90"
          >
            See upcoming events
          </Link>
        </div>
      </section>
    </>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-plum font-extrabold text-white">
        {n}
      </span>
      <div>
        <div className="font-extrabold text-ink">{title}</div>
        <div className="text-sm text-ink/60">{body}</div>
      </div>
    </li>
  );
}
