import { describe, it, expect } from 'vitest';
import { memberFeedbackEmail } from '@/lib/emails/feedbackEmail';
import { escapeHtml } from '@/lib/escapeHtml';

const member = { name: 'Olivia <b>Bennett</b>', email: 'olivia@example.com', mobile: '0491 570 006' };

describe('member feedback email', () => {
  it('shows what the member typed as text, never as markup', () => {
    const { html } = memberFeedbackEmail({ member, event: null, message: 'Great night! <a href="https://evil.example">click</a> & <img src=x>' });
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;click&lt;/a&gt; &amp; &lt;img src=x&gt;');
    expect(html).toContain('Olivia &lt;b&gt;Bennett&lt;/b&gt;');
  });

  it('says which event it is about, or that it is a general comment', () => {
    const general = memberFeedbackEmail({ member, event: null, message: 'hi' });
    expect(general.subject).toBe('Feedback from Olivia <b>Bennett</b>');
    expect(general.html).toContain('General comment');
    const about = memberFeedbackEmail({ member, event: { name: '35-49 years', venue: 'City Tattersalls Club', when: 'Wed 30 Sep 2026 at 7:30pm' }, message: 'hi' });
    expect(about.subject).toContain('35-49 years (Wed 30 Sep 2026 at 7:30pm)');
    expect(about.html).toContain('City Tattersalls Club');
  });

  it('escapeHtml covers the five characters that matter', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});
