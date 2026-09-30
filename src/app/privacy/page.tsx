import type { ReactNode } from 'react';
import { Container, PageHero } from '@/components/site/layout';
import { linkClass } from '@/components/site/button';

export default function PrivacyPage() {
  return (
    <>
      <PageHero title="Privacy Policy" />
      <Container className="pb-[clamp(56px,6.7vw,96px)] pt-[clamp(32px,4.4vw,64px)]">
        <div className="max-w-[720px] text-base leading-relaxed text-ink-600 md:text-[17px]">
          <P>Fast Match conducts events, workshops and seminars for singles, couples and friends and the main vehicle for information distribution and collection is www.fastmatch.com.au</P>
          <P>Fast Match is bound by the National Privacy Principles contained in the Commonwealth Privacy Act. Fast Match may, from time to time, review and update this privacy policy statement to take account of new laws and technology and changes to Fast Match&apos;s operations. All personal information held by Fast Match will be governed by its most recent policy, posted on Fast Match.</P>

          <H2>What we collect</H2>
          <P>Fast Match collects personal information from members of the public, including (but not limited to) name, address, contact details, gender, occupation, age, hobbies, event preferences, and in some cases financial information, including credit card information, banking details and income information.</P>
          <P>We store the personal information you enter on fastmatch.com.au — obtained mainly through registration, updates to membership details, and bookings. We may also use cookies to assign your computer a &apos;User ID&apos; to help identify your computer to our servers; you can disable cookies via your browser settings.</P>

          <H2>How we use it</H2>
          <P>Fast Match generally uses personal information to provide the products or services you&apos;ve requested, personalise your experience, manage and enhance our services, communicate with you, and — with your consent — send you information about offers, products or services we believe may interest you.</P>

          <H2>Disclosure</H2>
          <P>Fast Match may provide your information to third parties engaged to perform functions on its behalf, such as processing credit card payments, mailouts, marketing, research and advertising.</P>

          <H2>Sensitive information</H2>
          <P>&quot;Sensitive Information&quot; means information relating to a person&apos;s racial or ethnic origin, membership of political bodies, religion, membership of a trade union or professional or trade association, and sexual preferences. Fast Match only uses or discloses Sensitive Information for the purpose it was provided, a directly related secondary purpose, or as allowed by law, unless you&apos;ve agreed otherwise.</P>

          <H2>Security</H2>
          <P>Fast Match protects the personal information it holds from misuse, loss, unauthorised access, modification or disclosure through firewalls, password access, secure servers and encryption of credit card transactions.</P>

          <H2>Updating your information</H2>
          <P>You can update your Fast Match membership information at any time via the &apos;Update your details&apos; section of the app. Where personal information is no longer required, it will be destroyed or de-identified.</P>

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
