'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SplitLayout, FormCard } from '@/components/site/layout';
import { Field, TextInput, SelectInput, Checkbox, RadioCards, FormError, FormSuccess } from '@/components/site/form';
import { Button, linkClass } from '@/components/site/button';
import { NETWORK_ERROR } from '@/lib/networkError';

interface City { id: string; name: string; }

export default function RegisterPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({
    name: '', gender: 'MALE', email: '', password: '', cityId: '', dateOfBirth: '', mobile: '',
  });
  const [agreedTerms, setAgreedTerms] = useState(false);
  // Unticked: marketing needs their say-so (Gil, Q13). Left unticked, they
  // still join, and get emails about their own bookings only.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Where the "finish signing up" email went, once sent.
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Where they were going when they decided to sign up (an event they were
  // booking, say): carried through the email link and the mobile code, then
  // back there. Checked by the server before it's kept.
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    // No city chosen for them: the first in the list (Adelaide) used to be
    // preselected, and members who didn't notice joined the wrong city.
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    setNext(new URLSearchParams(window.location.search).get('next'));
  }, []);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, agreedTerms, marketingOptIn, ...(next ? { next } : {}) }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (!res) { setError(NETWORK_ERROR); return; }
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Please check your details and try again.');
      return;
    }
    // The same answer whether or not the address is already a member's: the
    // email that arrives says which (src/lib/pendingSignup.ts). The account is
    // made from its link, and the mobile code texted then.
    setSentTo(form.email.trim());
    window.scrollTo({ top: 0 });
  }

  if (sentTo) {
    return (
      <SplitLayout title="Check your email" lead="One more step to finish creating your profile." stickyIntro>
        <FormCard>
          <FormSuccess>We&apos;ve sent an email to {sentTo}.</FormSuccess>
          <p className="text-[15px] leading-normal text-ink-600">
            Click the link in it to confirm your email address and finish signing up. Then we&apos;ll text a
            code to your mobile, and you&apos;re ready to book. The link works for 7 days.
          </p>
          <p className="text-[15px] leading-normal text-ink-600">
            Can&apos;t see it? Check your spam folder. If you already have an account, the email tells you how to log in.
          </p>
          <p className="text-center text-[15px] text-ink-600">
            Already a member? <Link href={loginHref} className={linkClass}>Log in</Link>
          </p>
        </FormCard>
      </SplitLayout>
    );
  }

  return (
    <SplitLayout title="Create your profile" lead="Register below and we'll email you to confirm your membership." stickyIntro>
      <FormCard>
        <form onSubmit={handleSubmit} className="flex flex-col gap-[22px]">
          <Field label="Name">
            <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          </Field>
          <RadioCards
            legend="Gender"
            name="gender"
            value={form.gender}
            options={[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }]}
            onChange={(gender) => setForm({ ...form, gender })}
          />
          <Field label="Email">
            <TextInput type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />
          </Field>
          <Field label="Password">
            <TextInput type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
          </Field>
          <Field label="City">
            <SelectInput required value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
              <option value="" disabled>Select your city</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>
          {/* Side by side while both fit, stacked on a phone. */}
          <div className="flex flex-wrap gap-x-3.5 gap-y-[22px]">
            <Field label="Date of birth" className="flex-[1_1_150px]">
              <TextInput type="date" required value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </Field>
            <Field label="Mobile" className="flex-[1_1_150px]">
              <TextInput type="tel" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="04XX XXX XXX" />
            </Field>
          </div>

          <Checkbox checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)}>
            Email and text me about upcoming FastMatch events and offers. You can unsubscribe any time.
          </Checkbox>
          <Checkbox checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)}>
            I'm 18+ and I agree to the <Link href="/terms" className={linkClass}>Terms &amp; Conditions</Link> and{' '}
            <Link href="/privacy" className={linkClass}>Privacy Policy</Link>
          </Checkbox>

          {error && <FormError>{error}</FormError>}

          <Button type="submit" disabled={loading || !agreedTerms} loading={loading} block>
            {loading ? 'Signing up…' : 'Sign up now'}
          </Button>

          <p className="text-center text-[15px] text-ink-600">
            Already a member? <Link href={loginHref} className={linkClass}>Log in</Link>
          </p>
        </form>
      </FormCard>
    </SplitLayout>
  );
}
