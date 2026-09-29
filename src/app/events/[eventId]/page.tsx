'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Field, Input, Select } from '@/components/ui';
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
  maxMen: number;
  maxWomen: number;
  menBooked: number;
  womenBooked: number;
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

  if (notFound) return <p className="text-sm text-ink/50">This event isn&apos;t available.</p>;
  if (!event) return <p className="text-sm text-ink/50">Loading…</p>;

  // The event's own local time, with "(Perth time)" if the viewer's differs.
  const when = formatEventForViewer(event.startsAt, event.city.name);
  // Used only to switch the button to "Sold out". The count itself is never
  // shown — Gil doesn't want members to see how many have booked.
  const spotsLeft = event.maxMen + event.maxWomen - (event.menBooked + event.womenBooked);
  const canBook = !event.alreadyBooked && spotsLeft > 0;
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
    setBooking(false);
    // A logged-out visitor can browse events but can't book one. Send them to
    // log in and return them to this event afterwards, rather than showing a
    // dead-end "Not authenticated" message with nothing to act on.
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);
      return;
    }
    if (!res.ok) {
      if (Array.isArray(data.fieldErrors)) setServerErrors(data.fieldErrors);
      setError(data.error ?? 'Something went wrong — please try again.');
      return;
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      router.push(`/events/${eventId}/booked`);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5 rounded-xl bg-gradient-to-br from-plum to-plum-dark p-6 text-white">
        {/* Plain text, not the pill <Badge>: on this purple panel the muted
            badge rendered dark grey on near-transparent grey (unreadable),
            and its pill padding pushed it out of line with the heading and
            venue below. White, and flush with them. */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-white/80">{event.theme.name}</p>
            <h1 className="mt-2 text-xl font-extrabold">{event.name}</h1>
            <p className="mt-1 text-sm text-white/80">{venueLine(event.venue)}, {event.city.name}</p>
          </div>
          {/* The venue's logo beside its name, on a white tile — logos are
              drawn for white backgrounds and vanish on the purple. */}
          {event.venue.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.venue.logoUrl} alt={event.venue.name} className="h-16 w-16 shrink-0 rounded-lg bg-white object-contain p-1.5 sm:h-20 sm:w-20" />
          )}
        </div>
      </div>

      {/* The event's own photo, uploaded on the event form. Nothing renders
          if this event has none, so the page still reads correctly. */}
      {event.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.photoUrl}
          alt={event.name}
          className="mb-5 h-48 w-full rounded-xl object-cover sm:h-56"
        />
      )}

      {/* Directly under the photo, where Gil asked for it — the blurb sells
          the night, so it belongs above the price and the button rather than
          below them. whitespace-pre-line keeps the admin's line breaks: the
          field is a textarea and people write in paragraphs. */}
      {event.description && (
        <div className="mb-5 whitespace-pre-line text-sm leading-relaxed text-ink/70">
          {event.description}
        </div>
      )}

      <Card className="mb-4">
        <Row label="Date & time" value={`${when.longDate}, ${when.time}${when.note ? ` (${when.note})` : ''}`} />
        <Row label="Ages" value={`${event.ageMin}–${event.ageMax}`} />
      </Card>

      {/* "Book" in the members' events table lands here (/events/:id#book). */}
      <div id="book" className="scroll-mt-4" />
      <Card className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase text-ink/50">Ticket price</div>
          <div className="text-2xl font-extrabold text-plum">${event.cost}</div>
        </div>
        {/* "FastMatch Discounts" on the event decides whether codes apply. */}
        {event.fastmatchDiscounts && canBook && (
          <div className="w-44">
            <Field label="Discount code">
              <Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="Optional" />
            </Field>
            {checkingCode && <p className="-mt-3 text-xs text-ink/50">Checking…</p>}
            {couponError && <p className="-mt-3 text-xs font-medium text-coral">{couponError}</p>}
            {coupon && !coupon.alreadyUsed && <p className="-mt-3 text-xs font-bold text-green-dark">Code applied</p>}
            {coupon?.alreadyUsed && <p className="-mt-3 text-xs font-medium text-coral">You&apos;ve already used this code</p>}
          </div>
        )}
      </Card>

      {me && canBook && (
        <Card className="mb-5">
          <h2 className="mb-1 font-extrabold text-ink">Please confirm your details</h2>
          <p className="mb-3 text-xs text-ink/50">This is who we&apos;re booking in.</p>
          <Row label="Name" value={me.name} />
          <Row label="Email" value={me.email} />
          <Row label="Mobile" value={me.mobile} />
          <Row label="Date of birth" value={new Date(me.dateOfBirth).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} />
          <Row label="Gender" value={me.gender === 'MALE' ? 'Male' : 'Female'} />
          <p className="mt-3 text-xs text-ink/50">
            Something wrong? <Link href="/account/edit-profile" className="font-bold text-plum hover:underline">Update your details</Link> before booking.
          </p>
        </Card>
      )}

      {showFriends && (
        <Card className="mb-5">
          <h2 className="mb-1 font-extrabold text-ink">Would you like to bring any friends?</h2>
          <p className="mb-4 text-sm text-ink/60">
            Every friend you bring gives <strong>you</strong> a ${GROUP_DISCOUNT_PER_FRIEND} discount. You pay for your friends as part of this booking.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Male friends">
              <Select value={males.length} onChange={(e) => setCount('MALE', Number(e.target.value))}>
                {Array.from({ length: MAX_FRIENDS_PER_GENDER + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Female friends">
              <Select value={females.length} onChange={(e) => setCount('FEMALE', Number(e.target.value))}>
                {Array.from({ length: MAX_FRIENDS_PER_GENDER + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          </div>

          {([['MALE', males], ['FEMALE', females]] as const).map(([g, list]) =>
            list.map((f, i) => (
              <div key={`${g}-${i}`} className="mt-2 rounded-lg border border-ink/10 bg-cream/30 p-4">
                <h3 className="mb-3 text-sm font-extrabold text-ink">{g === 'MALE' ? 'Male' : 'Female'} friend {i + 1}</h3>
                {/* autoComplete off: otherwise the browser offers the MEMBER's
                    own saved name, email and mobile for their friend. */}
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <FriendField label="Name" error={fieldError(g, i, 'name')}>
                    <Input autoComplete="off" value={f.name} onChange={(e) => editFriend(g, i, { name: e.target.value })} onBlur={() => touch(g, i, 'name')} />
                  </FriendField>
                  <FriendField label="Mobile" error={fieldError(g, i, 'mobile')}>
                    <Input type="tel" autoComplete="off" placeholder="e.g. 0412345678" value={f.mobile} onChange={(e) => editFriend(g, i, { mobile: e.target.value })} onBlur={() => touch(g, i, 'mobile')} />
                  </FriendField>
                  <FriendField label="Email" error={fieldError(g, i, 'email')}>
                    <Input type="email" autoComplete="off" value={f.email} onChange={(e) => editFriend(g, i, { email: e.target.value })} onBlur={() => touch(g, i, 'email')} />
                  </FriendField>
                  {/* Their age is worked out from this and checked against the
                      event's age range as soon as a date is picked. */}
                  <FriendField label="Date of birth" error={fieldError(g, i, 'dateOfBirth')}>
                    <Input type="date" max={todayIso()} autoComplete="off" value={f.dateOfBirth}
                      onChange={(e) => { editFriend(g, i, { dateOfBirth: e.target.value }); touch(g, i, 'dateOfBirth'); }} />
                  </FriendField>
                </div>
              </div>
            )),
          )}
        </Card>
      )}

      {quote && canBook && (
        <Card className="mb-5">
          <h2 className="mb-3 font-extrabold text-ink">Booking details</h2>
          <div className="text-sm">
            {quote.lines.map((l, i) => (
              <div key={i} className="flex justify-between py-1">
                <span className={l.amount == null ? 'font-medium text-coral' : 'text-ink/70'}>{l.label}</span>
                {l.amount != null && <span className={l.amount < 0 ? 'text-green-dark' : 'text-ink'}>{money(l.amount)}</span>}
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t-2 border-ink/80 pt-2 font-extrabold text-ink">
              <span>Total</span><span>{money(quote.total)}</span>
            </div>
            <div className="flex justify-between py-1 text-xs text-ink/50">
              <span>GST inc.</span><span>{money(quote.gstIncluded)}</span>
            </div>
          </div>
        </Card>
      )}

      {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

      {event.alreadyBooked ? (
        <p className="rounded-lg bg-green/15 p-3 text-center text-sm font-bold text-green-dark">You're already booked in for this event.</p>
      ) : (
        <Button onClick={handleBook} disabled={booking || spotsLeft <= 0 || checkingCode} className="w-full">
          {spotsLeft <= 0
            ? 'Sold out'
            : booking
              ? 'Booking…'
              : !quote
                ? 'Book this event'
                : quote.total > 0
                  ? `Continue to payment — ${money(quote.total)}`
                  : 'Confirm booking'}
        </Button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink/5 py-2.5 text-sm last:border-0">
      <span className="text-ink/50">{label}</span>
      <span className="font-bold text-ink">{value}</span>
    </div>
  );
}

function FriendField({ label, error, children }: { label: string; error: string | null; children: React.ReactNode }) {
  return (
    <Field label={label}>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-coral">{error}</p>}
    </Field>
  );
}
