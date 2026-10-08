import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, PageHero } from '@/components/site/layout';
import { linkClass } from '@/components/site/button';

export const metadata: Metadata = { title: 'Privacy policy' };
// Read on each visit, so the address below follows APP_URL when the site
// moves domain (5minutedating.com.au now, fastmatch.com.au soon, Gil).
export const dynamic = 'force-dynamic';

/** The site's own address, as members see it in their browser ("fastmatch.com.au"). */
function siteAddress(): string {
  try {
    return new URL(process.env.APP_URL ?? '').host.replace(/^www\./, '') || 'fastmatch.com.au';
  } catch {
    return 'fastmatch.com.au';
  }
}

/** When this policy last changed, shown at the top (update it with the wording). */
const LAST_UPDATED = '9 October 2026';

export default function PrivacyPage() {
  const site = siteAddress();
  return (
    <>
      <PageHero title="Privacy Policy" />
      <Container className="pb-[clamp(56px,6.7vw,96px)] pt-[clamp(32px,4.4vw,64px)]">
        <div className="max-w-[720px] text-base leading-relaxed text-ink-600 md:text-[17px]">
          <P><strong className="font-bold text-ink-900">Last updated: {LAST_UPDATED}</strong></P>
          <P>Fast Match conducts events, workshops and seminars for singles, couples and friends, and the main way we collect and share information is our website, {site}.</P>
          <P>Fast Match is bound by the Australian Privacy Principles contained in the Privacy Act 1988 (Cth). We may review and update this policy from time to time, to take account of new laws and technology and changes to how Fast Match works. The current version is always the one on this page.</P>

          <H2>What we collect</H2>
          <P>We collect only what we need to run your membership, your bookings and our events:</P>
          <Ul>
            <li><b>Your account:</b> your name, email address, mobile number, gender, date of birth and city; your password, which is stored scrambled so that nobody can read it, us included; how you like to be contacted, whether you&apos;d like our event news and offers, and when you accepted our Terms &amp; Conditions.</li>
            <li><b>Your bookings:</b> the events you book, what you paid and any discount code you used, and the details of any friends you book in (their name, email address, mobile number, gender and date of birth).</li>
            <li><b>At our events:</b> whether you checked in, your number for the night, the choices you make about the people you meet (&ldquo;Date&rdquo;, &ldquo;Friend&rdquo; or &ldquo;No&rdquo;) and your matches.</li>
            <li><b>Messages you send us:</b> what you write on our Contact and Feedback pages and, if you use Tell A Friend, your friend&apos;s first name, email address, mobile number, gender and age.</li>
            <li><b>When you use the website:</b> a cookie that keeps you logged in (for up to 30 days), and the internet (IP) address of your device, which our server records in its logs and uses for a short time to stop repeated attempts, such as many wrong passwords. On the night of an event, choices you haven&apos;t sent yet are kept on your own phone until you send them.</li>
          </Ul>
          <P>Card payments are made on the secure payment page of Stripe, our payment provider: Fast Match never sees or stores your card number. We don&apos;t ask for your address, occupation, income or bank details, and our website doesn&apos;t set any advertising or tracking cookies of its own.</P>

          <H2>How we use it</H2>
          <Ul>
            <li>To run your account and bookings, including confirming your email address and mobile number.</li>
            <li>To run our events: checking you in, showing you the people you can choose from on the night, and working out your matches.</li>
            <li>To send you messages about your account and your bookings, such as confirmations, reminders, changes to an event and your results. These are about your own bookings, so we send them whatever your contact preferences.</li>
            <li>With your consent, to send you our event news and offers by email and text. You can stop them at any time with the Unsubscribe link in any of our emails, the opt-out link in any of our texts, or on <Link href="/account" className={linkClass}>My account</Link>.</li>
            <li>To answer your messages, look after our records, improve our events and keep our website secure.</li>
          </Ul>

          <H2>Who sees your information</H2>
          <Ul>
            <li><b>Your matches.</b> When you and another member choose each other (a Date or Friend match), you each receive the other&apos;s name, email address and mobile number, by email and on My Match History. People you don&apos;t match with never see your contact details.</li>
            <li><b>People at your event.</b> On the night, the other people checked in who can choose you see your name and your number for the night.</li>
            <li><b>Fast Match.</b> Our staff can see your details, bookings, choices and matches, to run our events and answer your questions.</li>
            <li><b>Our service providers,</b> who handle information for us to run the website: Stripe (card payments), Mailgun (our emails), Cellcast (our text messages), YouTube (the video on our home page, which YouTube provides under its own privacy policy) and our website hosting provider. Some of them may store or process information outside Australia.</li>
          </Ul>
          <P>We don&apos;t sell your information. We may also disclose it where the law requires or allows us to.</P>

          <H2>Sensitive information</H2>
          <P>&quot;Sensitive Information&quot; means information relating to a person&apos;s racial or ethnic origin, membership of political bodies, religion, membership of a trade union or professional or trade association, and sexual preferences. Fast Match only uses or discloses Sensitive Information for the purpose it was provided, a directly related secondary purpose, or as allowed by law, unless you&apos;ve agreed otherwise.</P>

          <H2>Security</H2>
          <P>Fast Match protects the personal information it holds from misuse, loss, unauthorised access, modification or disclosure: our website uses encrypted connections, passwords are stored scrambled, only Fast Match staff can use the website&apos;s admin area, and card payments are handled by Stripe.</P>

          <H2>Updating your information</H2>
          <P>You can update your Fast Match membership information at any time from <Link href="/account/edit-profile" className={linkClass}>My account › Edit profile</Link>. To close your account and have your information deleted, email us at the address below. Where personal information is no longer required, it will be destroyed or de-identified.</P>

          <H2>Accessing your information</H2>
          <P>You have the right to access the personal information Fast Match holds about you and to advise us of any inaccuracy, subject to some exceptions under the Privacy Act. We may ask you to verify your identity and may charge a fee to cover the cost of meeting your request.</P>

          <H2>Contact</H2>
          <P>If you have enquiries or wish to provide feedback about this policy, please email <a href="mailto:gil@fastmatch.com.au" className={linkClass}>gil@fastmatch.com.au</a></P>
        </div>
      </Container>
    </>
  );
}

// The legal pages' reading column: a section heading, and a paragraph
// spaced from whatever precedes it.
function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-12 font-display text-[clamp(24px,2vw,28px)] font-extrabold leading-tight tracking-[-0.02em] text-plum-900">
      {children}
    </h2>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 first:mt-0">{children}</p>;
}

function Ul({ children }: { children: ReactNode }) {
  return <ul className="mt-4 list-disc space-y-2 pl-6 [&_b]:font-bold [&_b]:text-ink-900">{children}</ul>;
}
