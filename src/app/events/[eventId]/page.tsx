'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Container, PageHero, PageLoader, BackLink } from '@/components/site/layout';
import { Field, FieldError, FormError, FormSuccess, SelectInput, TextInput } from '@/components/site/form';
import { Button, linkClass } from '@/components/site/button';
import { venueLine } from '@/lib/venue';
import { formatEventForViewer } from '@/lib/timezone';
import { priceBooking, GROUP_DISCOUNT_PER_FRIEND, MAX_FRIENDS_PER_GENDER, type CouponType } from '@/lib/bookingPrice';
import { validateFriends, type FriendFieldError, type FriendGender } from '@/lib/friendBooking';

interface EventDetail {
  id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  venue: { name: string; address: string | null; logoUrl: string | null };
  startsAt: string;
  ageMin: number;
  ageMax: number;
  cost: string;
  // Every place taken (worked out by the server; the counts stay private).
  soldOut: boolean;
  alreadyBooked: boolean;
  fastmatchDiscounts: boolean;
  groupDiscounts: boolean;
  theme: { name: string };
  city: { name: string };
}
interface Me { name: string; email: string; mobile: string; dateOfBirth: string; gender: FriendGender }
interface FriendForm { name: string; mobile: string; email: string; dateOfBirth: string }
interface Coupon { code: string; type: CouponType; amount: number | null; alreadyUsed: boolean }

const blankFriend = (): FriendForm => ({ name: '', mobile: '', email: '', dateOfBirth: '' });
// Latest date a date picker should offer: nobody is born in the future.
const todayIso = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const [discountCode, setDiscountCode] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const latestCode = useRef('');

  // Friends are kept per gender so changing one count never wipes what was
  // typed for the other; they're flattened men-first for checks and the API.
  const [males, setMales] = useState<FriendForm[]>([]);
  const [females, setFemales] = useState<FriendForm[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FriendFieldError[]>([]);

  useEffect(() => {
    fetch(`/api/events/${eventId}`).then(async (r) => {
      if (!r.ok) { setNotFound(true); return; }
      setEvent(await r.json());
    });
    // Public endpoint — { member: null } when logged out.
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d?.member ?? null)).catch(() => setMe(null));
  }, [eventId]);

  // Coming Back from the payment page can restore this page exactly as it was
  // left — mid-"Booking…". Reset the button so they can try again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setBooking(false); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  // Check the discount code shortly after the member stops typing, so the
  // summary shows the discount — or "promotion already used" — before they pay.
  useEffect(() => {
    const code = discountCode.trim();
    latestCode.current = code;
    setCoupon(null);
    setCouponError(null);
    if (!code || !me || !event?.fastmatchDiscounts) { setCheckingCode(false); return; }
    setCheckingCode(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/events/${eventId}/discount`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (latestCode.current !== code) return;
      setCheckingCode(false);
      if (res.ok) setCoupon(data);
      else setCouponError(typeof data.error === 'string' ? data.error : 'This discount code could not be checked.');
    }, 500);
    return () => clearTimeout(timer);
  }, [discountCode, me, event, eventId]);

  if (notFound) {
    return (
      <Container className="py-16">
        <BackLink href="/events" label="Back to upcoming events" className="mb-3" />
        <p className="text-base text-ink-600">This event isn&apos;t available.</p>
      </Container>
    );
  }
  if (!event) return <Container><PageLoader>Loading event…</PageLoader></Container>;

  // The event's own local time, with "(Perth time)" if the viewer's differs.
  const when = formatEventForViewer(event.startsAt, event.city.name);
  // Switches the button to "Sold out". How many have booked is never sent to
  // the page — Gil doesn't want members to see how full a night is.
  const soldOut = event.soldOut;
  const canBook = !event.alreadyBooked && !soldOut;
  const showFriends = !!me && canBook && event.groupDiscounts;

  const friends = [
    ...(showFriends ? males.map((f) => ({ ...f, gender: 'MALE' as const })) : []),
    ...(showFriends ? females.map((f) => ({ ...f, gender: 'FEMALE' as const })) : []),
  ];
  const clientErrors = me ? validateFriends(friends, { ageMin: event.ageMin, ageMax: event.ageMax, memberEmail: me.email }) : [];
  const flatIndex = (g: FriendGender, i: number) => (g === 'MALE' ? i : males.length + i);
  const fieldError = (g: FriendGender, i: number, field: FriendFieldError['field']) => {
    const idx = flatIndex(g, i);
    const server = serverErrors.find((e) => e.index === idx && e.field === field);
    if (server) return server.message;
    if (!submitted && !touched.has(`${idx}-${field}`)) return null;
    return clientErrors.find((e) => e.index === idx && e.field === field)?.message ?? null;
  };

  const quote = me
    ? priceBooking({
        cost: Number(event.cost),
        memberName: me.name,
        friends: friends.map((f) => ({ name: f.name.trim(), gender: f.gender })),
        coupon: coupon ? { code: coupon.code, type: coupon.type, amount: coupon.amount } : null,
        couponAlreadyUsed: coupon?.alreadyUsed ?? false,
      })
    : null;

  function setCount(g: FriendGender, n: number) {
    const resize = (prev: FriendForm[]) => (n > prev.length ? [...prev, ...Array.from({ length: n - prev.length }, blankFriend)] : prev.slice(0, n));
    if (g === 'MALE') setMales(resize); else setFemales(resize);
    setServerErrors([]);
  }
  function editFriend(g: FriendGender, i: number, patch: Partial<FriendForm>) {
    const apply = (prev: FriendForm[]) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f));
    if (g === 'MALE') setMales(apply); else setFemales(apply);
    setServerErrors((errs) => errs.filter((e) => e.index !== flatIndex(g, i)));
  }
  const touch = (g: FriendGender, i: number, field: string) =>
    setTouched((t) => new Set(t).add(`${flatIndex(g, i)}-${field}`));

  async function handleBook() {
    setError(null);
    setSubmitted(true);
    if (clientErrors.length > 0) { setError('Please check your friends’ details below.'); return; }
    if (couponError) { setError(couponError); return; }
    setBooking(true);
    const res = await fetch(`/api/events/${eventId}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discountCode: discountCode.trim() || undefined, friends }),
    });
    const data = await res.json().catch(() => ({}));
    // The button stays busy ("Booking…" with a spinner) while the browser
    // moves on to payment, login or the booked page — those can take a
    // second or two — and only comes back if the booking was refused.
    // A logged-out visitor can browse events but can't book one. Send them to
    // log in and return them to this event afterwards, rather than showing a
    // dead-end "Not authenticated" message with nothing to act on.
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);
      return;
    }
    if (!res.ok) {
      setBooking(false);
      if (Array.isArray(data.fieldErrors)) setServerErrors(data.fieldErrors);
      setError(data.error ?? 'Something went wrong. Please try again.');
      return;
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      router.push(`/events/${eventId}/booked`);
    }
  }

  // The main column holds the photo and blurb, plus — for a member who can
  // book — the details check and the friends form. With none of those the
  // booking card centres itself.
  const hasMain = !!event.photoUrl || !!event.description || (!!me && canBook);

  return (
    <>
      <PageHero
        back={{ href: '/events', label: 'Back to upcoming events' }}
        size="event"
        eyebrow={event.theme.name}
        title={event.name}
        lead={`${venueLine(event.venue)}, ${event.city.name}`}
        aside={
          // The venue's logo beside its name, on a white tile — logos are
          // drawn for white backgrounds and vanish on the purple.
          event.venue.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.venue.logoUrl} alt={event.venue.name} className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain p-2 md:h-24 md:w-24" />
          ) : undefined
        }
      />

      <section className="pb-[clamp(56px,6.7vw,96px)] pt-[clamp(20px,3.9vw,56px)]">
        <Container className="flex flex-wrap items-start justify-center gap-[clamp(24px,4.4vw,64px)]">
          {hasMain && (
            <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-[clamp(20px,2.2vw,32px)]">
              {/* The event's own photo, uploaded on the event form. Nothing renders
                  if this event has none, so the page still reads correctly. */}
              {event.photoUrl && (
                <div className="aspect-[16/7] overflow-hidden rounded-bubble bg-[#E9E0EF]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={event.photoUrl} alt={event.name} className="block h-full w-full object-cover" />
                </div>
              )}

              {/* Directly under the photo, where Gil asked for it — the blurb sells
                  the night, so it belongs above the price and the button rather than
                  below them. whitespace-pre-line keeps the admin's line breaks: the
                  field is a textarea and people write in paragraphs. */}
              {event.description && (
                <div className="max-w-[660px] whitespace-pre-line text-[clamp(17px,1.3vw,19px)] leading-[1.65] text-[#3E3548] text-pretty">
                  {event.description}
                </div>
              )}

              {me && canBook && (
                <Card>
                  <h2 className={CARD_TITLE}>Please confirm your details</h2>
                  <p className="mt-1 text-[15px] text-ink-600">This is who we&apos;re booking in.</p>
                  <dl className="mt-3 divide-y divide-line">
                    <Row label="Name" value={me.name} />
                    <Row label="Email" value={me.email} />
                    <Row label="Mobile" value={me.mobile} />
                    <Row label="Date of birth" value={new Date(me.dateOfBirth).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} />
                    <Row label="Gender" value={me.gender === 'MALE' ? 'Male' : 'Female'} />
                  </dl>
                  <p className="mt-4 text-sm text-ink-600">
                    Something wrong? <Link href="/account/edit-profile" className={linkClass}>Update your details</Link> before booking.
                  </p>
                </Card>
              )}

              {showFriends && (
                <Card>
                  <h2 className={CARD_TITLE}>Would you like to bring any friends?</h2>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-600">
                    Every friend you bring gives <strong className="text-ink-900">you</strong> a ${GROUP_DISCOUNT_PER_FRIEND} discount. You pay for your friends as part of this booking.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Field label="Male friends">
                      <SelectInput value={males.length} onChange={(e) => setCount('MALE', Number(e.target.value))}>
                        {Array.from({ length: MAX_FRIENDS_PER_GENDER + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                      </SelectInput>
                    </Field>
                    <Field label="Female friends">
                      <SelectInput value={females.length} onChange={(e) => setCount('FEMALE', Number(e.target.value))}>
                        {Array.from({ length: MAX_FRIENDS_PER_GENDER + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                      </SelectInput>
                    </Field>
                  </div>

                  {([['MALE', males], ['FEMALE', females]] as const).map(([g, list]) =>
                    list.map((f, i) => (
                      <div key={`${g}-${i}`} className="mt-4 rounded-[20px] border border-line bg-cream-50 p-4 sm:p-5">
                        <h3 className="mb-4 text-base font-extrabold text-ink-900">{g === 'MALE' ? 'Male' : 'Female'} friend {i + 1}</h3>
                        {/* autoComplete off: otherwise the browser offers the MEMBER's
                            own saved name, email and mobile for their friend. */}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Name" error={fieldError(g, i, 'name')}>
                            <TextInput autoComplete="off" value={f.name} onChange={(e) => editFriend(g, i, { name: e.target.value })} onBlur={() => touch(g, i, 'name')} />
                          </Field>
                          <Field label="Mobile" error={fieldError(g, i, 'mobile')}>
                            <TextInput type="tel" autoComplete="off" placeholder="e.g. 0412345678" value={f.mobile} onChange={(e) => editFriend(g, i, { mobile: e.target.value })} onBlur={() => touch(g, i, 'mobile')} />
                          </Field>
                          <Field label="Email" error={fieldError(g, i, 'email')}>
                            <TextInput type="email" autoComplete="off" value={f.email} onChange={(e) => editFriend(g, i, { email: e.target.value })} onBlur={() => touch(g, i, 'email')} />
                          </Field>
                          {/* Their age is worked out from this and checked against the
                              event's age range as soon as a date is picked. */}
                          <Field label="Date of birth" error={fieldError(g, i, 'dateOfBirth')}>
                            <TextInput type="date" max={todayIso()} autoComplete="off" value={f.dateOfBirth}
                              onChange={(e) => { editFriend(g, i, { dateOfBirth: e.target.value }); touch(g, i, 'dateOfBirth'); }} />
                          </Field>
                        </div>
                      </div>
                    )),
                  )}
                </Card>
              )}
            </div>
          )}

          {/* "Book" in the members' events table lands here (/events/:id#book). */}
          <aside id="book" className="sticky top-[calc(var(--header-h)+24px)] min-w-0 flex-[0_1_420px] scroll-mt-6">
            <div className="flex flex-col gap-5 rounded-[28px] border border-line bg-white p-[clamp(20px,2vw,28px)] shadow-[0_24px_48px_-28px_rgba(45,24,72,0.4)]">
              <dl className="flex flex-col">
                <div className="border-b border-line pb-4">
                  <dt className="text-sm font-semibold text-ink-600">Date &amp; time</dt>
                  <dd className="mt-1 text-lg font-bold leading-[1.4] text-ink-900">
                    {when.longDate}, {when.time}
                    {when.note && <> <span className="whitespace-nowrap">({when.note})</span></>}
                  </dd>
                </div>
                <div className="pt-4">
                  <dt className="text-sm font-semibold text-ink-600">Ages</dt>
                  <dd className="mt-1 text-lg font-bold leading-[1.4] text-ink-900">{event.ageMin}–{event.ageMax}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-end gap-x-5 gap-y-4 rounded-[20px] bg-plum-50 p-5">
                <div className="flex-[1_1_110px]">
                  <p className="text-sm font-semibold text-ink-600">Ticket price</p>
                  <p className="mt-1 font-display text-[44px] font-extrabold leading-none tracking-[-0.02em] text-plum-700">${event.cost}</p>
                </div>
                {/* "FastMatch Discounts" on the event decides whether codes apply. */}
                {event.fastmatchDiscounts && canBook && (
                  <div className="flex flex-[1_1_170px] flex-col gap-2">
                    <label htmlFor="discount-code" className="text-sm font-semibold text-ink-600">Discount code</label>
                    <TextInput
                      id="discount-code"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      placeholder="Optional"
                      aria-describedby="discount-status"
                      aria-invalid={couponError || coupon?.alreadyUsed ? true : undefined}
                      className="!h-12 !px-3.5"
                    />
                    <div id="discount-status" aria-live="polite">
                      {checkingCode && <p className="text-sm text-ink-600">Checking…</p>}
                      {couponError && <FieldError>{couponError}</FieldError>}
                      {coupon && !coupon.alreadyUsed && <p className="text-sm font-bold text-plum-700">✓ Code applied</p>}
                      {coupon?.alreadyUsed && <FieldError>You&apos;ve already used this code</FieldError>}
                    </div>
                  </div>
                )}
              </div>

              {quote && canBook && (
                <div>
                  <h2 className="mb-2 text-base font-extrabold text-ink-900">Booking details</h2>
                  <div className="text-[15px]">
                    {quote.lines.map((l, i) => (
                      <div key={i} className="flex justify-between gap-4 py-1">
                        <span className={l.amount == null ? 'font-semibold text-coral-700' : 'text-ink-600'}>{l.label}</span>
                        {l.amount != null && <span className={l.amount < 0 ? 'font-semibold text-plum-700' : 'text-ink-900'}>{money(l.amount)}</span>}
                      </div>
                    ))}
                    <div className="mt-2 flex justify-between border-t-2 border-ink-900 pt-2 font-extrabold text-ink-900">
                      <span>Total</span><span>{money(quote.total)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-sm text-ink-600">
                      <span>GST inc.</span><span>{money(quote.gstIncluded)}</span>
                    </div>
                  </div>
                </div>
              )}

              {error && <FormError>{error}</FormError>}

              {event.alreadyBooked ? (
                <FormSuccess>You&apos;re already booked in for this event.</FormSuccess>
              ) : (
                <Button onClick={handleBook} disabled={booking || soldOut || checkingCode} loading={booking} block size="hero">
                  {soldOut
                    ? 'Sold out'
                    : booking
                      ? 'Booking…'
                      : !quote
                        ? 'Book this event'
                        : quote.total > 0
                          ? `Continue to payment (${money(quote.total)})`
                          : 'Confirm booking'}
                </Button>
              )}
            </div>
          </aside>
        </Container>
      </section>
    </>
  );
}

const CARD_TITLE = 'font-display text-[clamp(22px,1.8vw,26px)] font-extrabold leading-tight tracking-[-0.02em] text-ink-900';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-[15px]">
      <dt className="text-ink-600">{label}</dt>
      <dd className="min-w-0 break-words text-right font-bold text-ink-900">{value}</dd>
    </div>
  );
}
