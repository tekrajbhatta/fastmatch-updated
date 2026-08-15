/**
 * Central email send function. Every email in the app — transactional and
 * marketing — goes through here, so there's one place the actual provider
 * lives rather than scattered fetch calls.
 *
 * Real Resend integration — was previously commented-out/unwritten. Falls
 * back to a console.log stub if RESEND_API_KEY isn't set, so local
 * development never accidentally emails anyone.
 */

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[stub] Would email ${to}: "${subject}"`);
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'FastMatch <no-reply@fastmatch.com.au>';

  const { error } = await resend.emails.send({
    from: fromAddress,
    to,
    subject,
    html,
  });

  if (error) {
    // Don't let an email failure crash whatever triggered it (a booking,
    // a match calculation, a blast batch) — log it clearly so it's
    // visible, and let the caller's own error handling (e.g. bounce
    // tracking on campaign sends) do the rest.
    console.error(`Failed to send email to ${to}:`, error);
    throw new Error(`Email send failed: ${error.message}`);
  }
}
