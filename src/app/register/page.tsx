'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Input, Select, Button, Card } from '@/components/ui';

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
    router.push('/verify-mobile');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Create your profile</h1>
      <p className="mb-6 text-sm text-ink/60">Register below and we'll email you to confirm your membership.</p>

      <Card>
        <form onSubmit={handleSubmit}>
          <Field label="Name">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          </Field>
          <Field label="Gender">
            <div className="flex gap-5 py-1 text-sm font-semibold">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={form.gender === 'MALE'} onChange={() => setForm({ ...form, gender: 'MALE' })} /> Male
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={form.gender === 'FEMALE'} onChange={() => setForm({ ...form, gender: 'FEMALE' })} /> Female
              </label>
            </div>
          </Field>
          <Field label="Email">
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />
          </Field>
          <Field label="Password">
            <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
          </Field>
          <Field label="City">
            <Select required value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth">
              <Input type="date" required value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </Field>
            <Field label="Mobile">
              <Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="04XX XXX XXX" />
            </Field>
          </div>

          <label className="mb-4 mt-1 flex items-start gap-2 text-xs text-ink/60">
            <input type="checkbox" className="mt-0.5" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} />
            <span>
              I'm 18+ and I agree to the <Link href="/terms" className="font-bold text-plum">Terms &amp; Conditions</Link> and{' '}
              <Link href="/privacy" className="font-bold text-plum">Privacy Policy</Link>
            </span>
          </label>

          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

          <Button type="submit" disabled={loading || !agreedTerms} className="w-full">
            {loading ? 'Signing up…' : 'Sign up now'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-ink/60">
          Already a member? <Link href="/login" className="font-bold text-plum">Log in</Link>
        </div>
      </Card>
    </div>
  );
}
