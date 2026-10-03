import type { MemberFilter } from '../memberFilter';

/**
 * Who a blast actually goes to, out of the members a filter matches.
 *
 * Unless "Ignore preference" is ticked, a blast only reaches members who:
 *   - opted in to offers (marketingOptIn),
 *   - accept the channel being sent (Email and SMS / Email / SMS — "Do not
 *     contact" never matches),
 *   - and, for email, haven't bounced.
 *
 * With "Exclude booked members", anyone already booked (into the chosen event,
 * or any upcoming one) is left out too.
 *
 * Whatever the settings, accounts still waiting for their first password are
 * left out: they never signed up, and a Tell A Friend invitee was promised no
 * further contact unless they finished registering. "Ignore preference"
 * overrides people's choices, not the fact that they never made one.
 *
 * One function, used by the send itself AND every count shown before it, so
 * "N members will receive this" is always the number that actually go.
 */
export function recipientFilter(
  base: MemberFilter,
  blast: { sendEmail: boolean; sendSms: boolean; ignorePreference: boolean; excludeBooked?: boolean; excludeBookedEventId?: string | null },
): MemberFilter {
  const contactMethods: ('EMAIL_AND_SMS' | 'EMAIL' | 'SMS')[] = [];
  if (blast.sendEmail) contactMethods.push('EMAIL_AND_SMS', 'EMAIL');
  if (blast.sendSms) contactMethods.push('EMAIL_AND_SMS', 'SMS');

  return {
    ...base,
    marketingOptInOnly: !blast.ignorePreference,
    contactMethods: blast.ignorePreference ? undefined : [...new Set(contactMethods)],
    excludeBounced: blast.sendEmail && !blast.ignorePreference,
    excludeAwaitingPasswordSetup: true,
    // Applies whatever "Ignore preference" says: it's about who's coming, not consent.
    ...(blast.excludeBooked ? { excludeBookedIn: { eventId: blast.excludeBookedEventId ?? null } } : {}),
  };
}
