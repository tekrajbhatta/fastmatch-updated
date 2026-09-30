import type { ReactNode } from 'react';
import { Container, PageHero } from '@/components/site/layout';
import { linkClass } from '@/components/site/button';

export default function TermsPage() {
  return (
    <>
      <PageHero title={'Terms & Conditions'} />
      <Container className="pb-[clamp(56px,6.7vw,96px)] pt-[clamp(32px,4.4vw,64px)]">
        <div className="max-w-[720px] text-base leading-relaxed text-ink-600 md:text-[17px]">
          <P>Fast Match operates as a service for adults only. To participate in a Fast Match event, you must be at least 18 years old. Please do not attempt to register if you are under 18 years old.</P>
          <P>As an adult, you are solely responsible for any information you supply and all of your communications with other Fast Match participants. By registering as a member, you agree to abide by these terms and conditions below:</P>
          <P>All material &amp; information in Fast Match is copyright and may not be used in whole or part without the permission of the Fast Match proprietor.</P>

          <H2>Limitation of liability</H2>
          <P>Under no circumstances will Fast Match be liable to you for any incidental, consequential, or indirect damages arising out of the Fast Match service. In addition, Fast Match disclaims all liability, regardless of the form of action, for the acts or omissions of other members or users.</P>
          <P>Places at an event will be allocated on a &apos;first come, first served&apos; system.</P>
          <P>If an event for a certain night is over or under-subscribed, an alternate evening will be arranged and you will be notified by email of the new date.</P>
          <P>Your credit card will not be debited until your place at one of our events is confirmed.</P>
          <P>Fast Match makes no guarantees or promises in regard to the quantity or quality of people you may meet through one of our events.</P>

          <H2>Cancellations &amp; refunds</H2>
          <P>Reservations may be cancelled by giving at least 7 days notice before an event. All bookings for non speed dating events (eg wine tours, food nights, bowling events, etc) cannot be cancelled or transferred within 7 days of the event. Cancellations must be received in writing via email to Fast Match. An administration fee of $5 will be retained from cancelled bookings.</P>
          <P>For cancellations with less than 7 days notice, you may only request a transfer to another event, refunds will not be given. All event transfers must be requested by 48 hours prior to the event taking place. For any cancellations after this time, no event transfers will be given and no refunds will be given.</P>
          <P>There are no refunds or transfers given to people who do not show up to an event. There are no refunds for being dissatisfied with the quality or calibre of fellow participants at the event. You take part in a Fast Match event with a clear understanding that you may, or may not meet someone.</P>

          <H2>Matches &amp; privacy</H2>
          <P>At the conclusion of the event, Fast Match will collate all match choices and exchange phone numbers for only those couples who have both expressed an interest in meeting each other. All other information will remain private and confidential.</P>
          <P>Fast Match takes no responsibility for false information supplied by members. We reserve the right to refuse or accept a reservation at our discretion. We reserve the right to use any photos or video footage taken at one of our events for ongoing advertising and promotional purposes. Should you not wish to be photographed or filmed, please advise the cameraman.</P>
          <P>Every attempt will be made to co-ordinate events which bring together people of similar age groups and locations, however, Fast Match may, at its discretion and without notice, combine or change configurations in order to facilitate an event.</P>
          <P>Acceptance of these terms and conditions also gives Fast Match permission to contact you from time to time with invitations, discounts, special offers, information and surveys for any products, services or sponsorships which Fast Match has negotiated on behalf of its members. Should you not wish to receive these offers, please contact Fast Match on <a href="mailto:gil@fastmatch.com.au" className={linkClass}>gil@fastmatch.com.au</a></P>
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
