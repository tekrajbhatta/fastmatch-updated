'use client';

import { useState } from 'react';
import { Field } from '@/components/ui';

/**
 * Photo picker for a blast, shared by the create and edit screens so the two
 * can't drift apart — the upload rules (what's accepted, how it's resized,
 * what the error says) live in one place.
 *
 * The file is uploaded as soon as it's chosen rather than held until save:
 * the server re-encodes and resizes it, so the URL it hands back is what
 * actually goes in the email, and the admin sees the real thing before
 * committing to it. The parent only ever stores that URL.
 */
export default function PhotoUploadField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/admin/uploads', { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'That image could not be uploaded.');
      return;
    }
    onChange(data.url);
  }

  return (
    <Field label="Photo">
      {value ? (
        <div className="flex items-start gap-3">
          {/* Plain <img>, not next/image: this is a runtime-uploaded file
              served from outside public/, so there is nothing for the image
              optimiser to know about at build time. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-24 w-24 rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => { onChange(''); setError(null); }}
            className="text-sm font-bold text-coral hover:underline"
          >
            Remove photo
          </button>
        </div>
      ) : (
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          className="w-full cursor-pointer text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-plum/10 file:px-3 file:py-2 file:text-sm file:font-bold file:text-plum hover:file:bg-plum/20"
        />
      )}
      {uploading && <p className="mt-1 text-xs text-ink/50">Uploading and optimising…</p>}
      {error && <p className="mt-1 text-xs font-medium text-coral">{error}</p>}
      {!value && !uploading && !error && (
        <p className="mt-1 text-xs text-ink/50">Optional. Resized automatically to fit the email.</p>
      )}
    </Field>
  );
}
