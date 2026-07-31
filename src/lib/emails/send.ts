/**
 * Central email send function. Every email in the app — transactional and
 * marketing — goes through here, so there's one place to wire up the actual
 * provider (Resend recommended) rather than scattered fetch calls.
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

  // TODO: uncomment once `resend` package + RESEND_API_KEY are set up
  // const { Resend } = await import('resend');
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'FastMatch <no-reply@fastmatch.com.au>',
  //   to,
  //   subject,
  //   html,
  // });
}
