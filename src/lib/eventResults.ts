/**
 * Whether an event's results are done, for the admin's screens: once the
 * matches are worked out (by the hourly job after midnight, or "Close event
 * now" on the night) and emailed, the dashboard, the events list and the
 * event's own page say the event is closed (Gil, 7 Nov: "this event is
 * closed and matches have been sent"). Until then they looked the same as
 * before, "Check-in is open" included.
 *
 * "Sent" only once every results email has gone (matchEmailsSent, set by
 * src/lib/sendMatchEmails.ts): if some failed, the screens say so rather
 * than claim they were sent. The job tries those again on its next run, and
 * the event's page has "Send them now".
 */

export type ResultsState = 'open' | 'sent' | 'not-all-emailed';

export function resultsState(event: { matchesCalculated: boolean; matchEmailsSent: boolean }): ResultsState {
  if (!event.matchesCalculated) return 'open';
  return event.matchEmailsSent ? 'sent' : 'not-all-emailed';
}

/** Gil's wording, on the dashboard and the event's page. */
export const RESULTS_SENT_MESSAGE = 'This event is closed and matches have been sent.';
export const RESULTS_NOT_ALL_EMAILED_MESSAGE = 'This event is closed, but not everyone has been emailed their results yet.';

/** The short form, as a tag on the events list. */
export const RESULTS_LABEL: Record<Exclude<ResultsState, 'open'>, string> = {
  sent: 'Closed · matches sent',
  'not-all-emailed': 'Closed · results not all emailed',
};
