'use client';

export interface VenueDetails {
  id: string;
  name: string;
  logoUrl: string | null;
  imageUrl: string | null;
  description: string | null;
}

/**
 * What picking a venue fills in on an event: its image as the event photo and
 * its description as the event description — but only where the event's own
 * field is still empty, so nothing already typed is lost. Returned as a
 * patch for the form. Copies, not links: the event can then be changed on its
 * own, and editing the venue later doesn't rewrite it.
 */
export function venueFillPatch(current: { photoUrl: string; description: string }, venue: VenueDetails | undefined) {
  if (!venue) return {};
  return {
    ...(!current.photoUrl && venue.imageUrl ? { photoUrl: venue.imageUrl } : {}),
    ...(!current.description.trim() && venue.description ? { description: venue.description } : {}),
  };
}

/**
 * Under the Venue dropdown on the event forms: the chosen venue's logo, image
 * and description, with buttons to (re)use them when the event's own photo or
 * description already holds something else.
 */
export default function VenueInfoPanel({
  venue, photoUrl, description, onUse,
}: {
  venue: VenueDetails | undefined;
  photoUrl: string;
  description: string;
  onUse: (patch: { photoUrl?: string; description?: string }) => void;
}) {
  if (!venue || (!venue.logoUrl && !venue.imageUrl && !venue.description)) return null;
  const canUseImage = !!venue.imageUrl && venue.imageUrl !== photoUrl;
  const canUseDescription = !!venue.description && venue.description !== description;

  return (
    <div className="mt-2 flex gap-3 rounded-lg bg-cream/40 p-3 text-xs text-ink/70">
      {(venue.logoUrl || venue.imageUrl) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={(venue.logoUrl || venue.imageUrl)!} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">From {venue.name}</p>
        {venue.description && <p className="line-clamp-2">{venue.description}</p>}
        {(canUseImage || canUseDescription) && (
          <div className="mt-1.5 flex flex-wrap gap-3">
            {canUseImage && (
              <button type="button" className="font-bold text-plum underline" onClick={() => onUse({ photoUrl: venue.imageUrl! })}>
                Use venue image as the photo
              </button>
            )}
            {canUseDescription && (
              <button
                type="button"
                className="font-bold text-plum underline"
                onClick={() => {
                  if (!description.trim() || confirm('Replace the event description with the venue’s?')) onUse({ description: venue.description! });
                }}
              >
                Use venue description
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
