'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard } from '@/components/site/layout';
import { Field, TextInput, SelectInput, Checkbox, RadioCards, FormError } from '@/components/site/form';
import { Button, linkClass } from '@/components/site/button';

interface City { id: string; name: string; }

export default function RegisterPage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({
    name: '', gender: 'MALE', email: '', password: '', cityId: '', dateOfBirth: '', mobile: '',
  });
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then((data) => {
      setCities(data);
      if (data.length) setForm((f) => ({ ...f, cityId: data[0].id }));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, agreedTerms, marketingOptIn: true }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Please check your details and try again.');
      return;
    }
    // Straight to SMS-code entry — booking requires BOTH email and mobile
    // verification, and the code was just texted during registration.
    // The account exists either way; if the text didn't get out, say so there
    // rather than claiming a code was sent that never arrived.
    router.push(data.smsSent === false ? '/verify-mobile?smsFailed=1' : '/verify-mobile');
    router.refresh();
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

          <Checkbox checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)}>
            I'm 18+ and I agree to the <Link href="/terms" className={linkClass}>Terms &amp; Conditions</Link> and{' '}
            <Link href="/privacy" className={linkClass}>Privacy Policy</Link>
          </Checkbox>

          {error && <FormError>{error}</FormError>}

          <Button type="submit" disabled={loading || !agreedTerms} block>
            {loading ? 'Signing up…' : 'Sign up now'}
          </Button>

          <p className="text-center text-[15px] text-ink-600">
            Already a member? <Link href="/login" className={linkClass}>Log in</Link>
          </p>
        </form>
      </FormCard>
    </SplitLayout>
  );
}
