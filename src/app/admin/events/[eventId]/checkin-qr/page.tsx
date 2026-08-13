'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Button } from '@/components/ui';

export default function CheckinQrPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [checkinUrl, setCheckinUrl] = useState('');

  useEffect(() => {
    const url = `${window.location.origin}/events/${eventId}/checkin`;
    setCheckinUrl(url);
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#3D1E6D', light: '#FFFFFF' } }).then(setQrDataUrl);
    fetch('/api/admin/events').then((r) => r.json()).then((events: any[]) => {
      const e = events.find((ev) => ev.id === eventId);
      if (e) setEventName(e.name);
    });
  }, [eventId]);

  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Check-in QR code</h1>
      <p className="mb-6 text-sm text-ink/60">Display on a tablet or print this page — one shared code for the whole event, attendees are identified from their own login.</p>

      <div className="mb-4 rounded-2xl border border-ink/10 bg-white p-8 print:border-none print:shadow-none">
        <div className="mb-4 font-extrabold text-ink">{eventName}</div>
        {qrDataUrl && <img src={qrDataUrl} alt="Check-in QR code" className="mx-auto" />}
        <div className="mt-4 break-all text-xs text-ink/40">{checkinUrl}</div>
      </div>

      <Button onClick={() => window.print()} className="print:hidden">Print this page</Button>

      <style jsx global>{`
        @media print {
          nav, header, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
