import { describeMemberFilter } from '../memberFilterParams';

/**
 * The boxes on a blast's Send tab, read from and written back to the blast's
 * saved filter (Campaign.filter). The tab used to open empty and replace the
 * saved filter wholesale on send, so a blast lost the audience it was last
 * sent to, and one set up from the Members list lost its search.
 *
 * No Prisma import: this runs in the browser too.
 */
export const CONTACT_METHODS = ['EMAIL_AND_SMS', 'EMAIL', 'SMS'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  EMAIL_AND_SMS: 'Email and SMS',
  EMAIL: 'Email',
  SMS: 'SMS',
};

export interface SendTabBoxes {
  ageMin: string;
  ageMax: string;
  gender: '' | 'MALE' | 'FEMALE';
  cityId: string;
  /** None ticked: any contact method. */
  contactMethods: ContactMethod[];
}

// The saved-filter keys the Send tab shows. Anything else in the filter (the
// Members list's search) is kept as it is.
const SEND_TAB_KEYS = ['ageMin', 'ageMax', 'gender', 'cityId', 'contactMethods'] as const;

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const ageBox = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

export function boxesFromSavedFilter(saved: unknown): SendTabBoxes {
  const f = asRecord(saved);
  const methods = Array.isArray(f.contactMethods) ? f.contactMethods : [];
  return {
    ageMin: ageBox(f.ageMin),
    ageMax: ageBox(f.ageMax),
    gender: f.gender === 'MALE' || f.gender === 'FEMALE' ? f.gender : '',
    cityId: typeof f.cityId === 'string' ? f.cityId : '',
    contactMethods: CONTACT_METHODS.filter((m) => methods.includes(m)),
  };
}

/**
 * The saved filter with the Send tab's boxes applied: each box sets its key
 * when filled in and removes it when cleared; everything else is kept.
 */
export function filterWithBoxes(saved: unknown, boxes: SendTabBoxes): Record<string, unknown> {
  const next: Record<string, unknown> = { ...asRecord(saved) };
  for (const key of SEND_TAB_KEYS) delete next[key];
  const age = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const ageMin = age(boxes.ageMin);
  const ageMax = age(boxes.ageMax);
  if (ageMin !== undefined && Number.isFinite(ageMin)) next.ageMin = ageMin;
  if (ageMax !== undefined && Number.isFinite(ageMax)) next.ageMax = ageMax;
  if (boxes.gender) next.gender = boxes.gender;
  if (boxes.cityId) next.cityId = boxes.cityId;
  const methods = CONTACT_METHODS.filter((m) => boxes.contactMethods.includes(m));
  if (methods.length) next.contactMethods = methods;
  return next;
}

/**
 * What else the saved filter limits the blast to that the Send tab has no box
 * for — the search carried over from the Members list — so the count isn't a
 * mystery. Each can be removed from the tab.
 */
export function otherSavedFilterParts(saved: unknown): { key: string; label: string }[] {
  const f = asRecord(saved);
  const search = typeof f.search === 'string' ? f.search.trim() : '';
  return search ? [{ key: 'search', label: describeMemberFilter({ search })[0] }] : [];
}
