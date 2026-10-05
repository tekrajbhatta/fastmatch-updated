import { ButtonLink } from '@/components/site/button';
import { formatEventForViewer } from '@/lib/timezone';
import type { CheckInState } from '@/lib/eventNight';

/**
 * A booked event's way in to the night: "Check in" while check-in is open
 * (from an hour before the start until midnight), "Choose your matches" once
 * checked in, and before that, when check-in opens. Members used to have no
 * way in from the site: only the link in their booking email, or the QR code
 * at the venue.
 */
export default function CheckInAction({ eventId, cityName, state, opensAt, checkedIn, block = false }: {
  eventId: string;
  cityName: string;
  state: CheckInState;
  opensAt: string | Date;
  checkedIn: boolean;
  block?: boolean;
}) {
  if (state === 'closed') return null;
  if (state === 'not-yet') {
    const opens = formatEventForViewer(opensAt, cityName);
    return (
      <p className="max-w-[300px] text-sm leading-snug text-ink-600">
        Check-in opens at {opens.time} on {opens.shortDate}{opens.note ? ` (${opens.note})` : ''}, an hour before the start.
      </p>
    );
  }
  return (
    <ButtonLink href={`/events/${eventId}/checkin`} size="sm" block={block}>
      {checkedIn ? 'Choose your matches' : 'Check in'}
    </ButtonLink>
  );
}
