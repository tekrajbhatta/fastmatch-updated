import { describe, it, expect } from 'vitest';
import { resolveCampaignEmailHtml } from '@/lib/emails/campaignEmail';

describe('blast email footer', () => {
  it('has Update your details (to Edit profile) beside Unsubscribe', () => {
    process.env.APP_URL = 'https://fastmatch.test/';
    const html = resolveCampaignEmailHtml({ heading: 'Hi', freeText: 'x' }, 'https://fastmatch.test/unsubscribe?token=t');
    expect(html).toContain('href="https://fastmatch.test/account/edit-profile"');
    expect(html).toContain('>Update your details</a>');
    expect(html).toContain('>Unsubscribe</a>');
  });
});

describe('venue logo in the blast email', () => {
  it('sits just below the venue details, above Book Now', () => {
    const html = resolveCampaignEmailHtml(
      { heading: 'Hi', eventDetailsText: 'Chung Lo Bar\n45 Jones St', venueLogoUrl: '/api/uploads/logo.png' },
      'https://x/unsub',
    );
    const details = html.indexOf('45 Jones St');
    const logo = html.indexOf('src="/api/uploads/logo.png"');
    const book = html.indexOf('>Book Now</a>');
    expect(details).toBeGreaterThan(-1);
    expect(logo).toBeGreaterThan(details);
    expect(book).toBeGreaterThan(logo);
  });

  it('nothing extra when the venue has no logo', () => {
    const html = resolveCampaignEmailHtml({ heading: 'Hi', eventDetailsText: 'Bar' }, 'https://x/unsub');
    expect(html).not.toContain('width="160"');
  });
});
