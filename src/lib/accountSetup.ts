/**
 * What a member still has to do before they can book: confirm their email
 * address, confirm their mobile, accept the Terms. One list, so the event
 * page's notice, the booking refusal, My Account and the "Finish setting up
 * your account" page all agree. Before this, nothing said what was missing
 * until a booking was refused, and the refusal linked nowhere.
 *
 * No Prisma import: this runs in the browser too.
 */
export type SetupStep = 'email' | 'mobile' | 'terms';

export interface SetupState {
  emailVerified: boolean;
  mobileVerified: boolean;
  agreedTerms: boolean;
}

export function unfinishedSteps(m: SetupState): SetupStep[] {
  const steps: SetupStep[] = [];
  if (!m.emailVerified) steps.push('email');
  if (!m.mobileVerified) steps.push('mobile');
  if (!m.agreedTerms) steps.push('terms');
  return steps;
}

/** Why a booking was refused, for a non-empty list of steps. */
export function bookingRefusal(steps: SetupStep[]): string {
  const confirm = [steps.includes('email') && 'email address', steps.includes('mobile') && 'mobile number'].filter(Boolean);
  const parts = [
    ...(confirm.length ? [`confirm your ${confirm.join(' and ')}`] : []),
    ...(steps.includes('terms') ? ['accept the Terms & Conditions and Privacy Policy'] : []),
  ];
  return `Please ${parts.join(' and ')} before booking.`;
}

/** The "Finish setting up your account" page, coming back to `next` afterwards. */
export const finishSetupHref = (next: string) => `/account/finish?next=${encodeURIComponent(next)}`;
export const verifyMobileHref = (next: string) => `/verify-mobile?next=${encodeURIComponent(next)}`;

/** Each step's one-line explanation and the link that sorts it out. */
export function setupStepLink(step: SetupStep, next: string): { text: string; label: string; href: string } {
  switch (step) {
    case 'email':
      return { text: 'Your email address isn’t confirmed yet.', label: 'Confirm your email', href: finishSetupHref(next) };
    case 'mobile':
      return { text: 'Your mobile number isn’t confirmed yet.', label: 'Confirm your mobile', href: verifyMobileHref(next) };
    case 'terms':
      return { text: 'You haven’t accepted our Terms & Conditions yet.', label: 'Accept the terms', href: finishSetupHref(next) };
  }
}

/** Admin pages are only for admins: a member never gets sent on to one after logging in. */
export const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/') || path.startsWith('/admin?');
