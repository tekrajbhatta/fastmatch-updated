/**
 * Central email send function. Every email in the app — transactional and
 * marketing — goes through here, so there's one place the actual provider
 * lives rather than scattered fetch calls.
 *
 * Provider: Mailgun over SMTP, via nodemailer. (Replaced Resend, which the
 * client does not use; their Mailgun account is carried over from the
 * existing FastMatch site.)
 *
 * Falls back to a console.log stub when SMTP credentials are absent, so local
 * development, CI and the production build never accidentally email anyone.
 */
import type { Transporter } from 'nodemailer';

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /**
   * Where pressing Reply goes, when it isn't us. Only Contact Us sets it (to
   * the visitor), so Gil's reply reaches them. Optional: every other caller
   * is unchanged.
   */
  replyTo?: string;
  /**
   * Blasts only: the one-click unsubscribe address (RFC 8058), sent as the
   * List-Unsubscribe and List-Unsubscribe-Post headers. Gmail and Yahoo
   * require them from bulk senders, and show their own "Unsubscribe" button
   * from them. Optional: every other caller is unchanged.
   */
  listUnsubscribe?: string;
}

// Cached transport. Built on first use and reused for the life of the process.
//
// Deliberately NOT constructed at module scope: Next.js imports every route
// module during `next build`'s "Collecting page data" step, so anything that
// reads required env vars (or throws) at module scope breaks the production
// build. This has already caused one failed deploy on this project.
//
// pool: true keeps a small set of SMTP connections open and reuses them.
// Campaign sends go out in batches of 100 messages, and opening a fresh
// connection per message is both slow and a good way to hit Mailgun's
// rate limits.
let transporter: Transporter | null = null;

async function getTransport(): Promise<Transporter> {
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(process.env.MAILGUN_SMTP_PORT || 587);

    transporter = nodemailer.createTransport({
      host: process.env.MAILGUN_SMTP_HOST || 'smtp.mailgun.org',
      port,
      // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
      secure: port === 465,
      auth: {
        user: process.env.MAILGUN_SMTP_USER as string,
        pass: process.env.MAILGUN_SMTP_PASS as string,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, html, replyTo, listUnsubscribe }: SendEmailArgs) {
  // An email header: never more than one line.
  const reply = replyTo?.replace(/[\r\n]+/g, '').trim() || undefined;
  const unsubscribeUrl = listUnsubscribe?.replace(/[\r\n<>]+/g, '').trim() || undefined;
  // Same stub behaviour as before, just keyed on the SMTP credentials rather
  // than an API key. Both must be present to attempt a real send.
  if (!process.env.MAILGUN_SMTP_USER || !process.env.MAILGUN_SMTP_PASS) {
    console.log(`[stub] Would email ${to}: "${subject}"${reply ? ` (reply-to ${reply})` : ''}${unsubscribeUrl ? ' (one-click unsubscribe)' : ''}`);
    return;
  }

  // Never hard-code a sending domain here. Mailgun only accepts mail from its
  // verified domains, and the verified domain is expected to change (a
  // mg.fastmatch.com.au subdomain is planned before launch), so the address
  // always comes from the environment.
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'FastMatch <no-reply@fastmatch.com.au>';

  try {
    const transport = await getTransport();
    await transport.sendMail({
      from: fromAddress, to, subject, html,
      ...(reply ? { replyTo: reply } : {}),
      ...(unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
    });
  } catch (err) {
    // Log it clearly so it's visible in journalctl, then rethrow so the
    // caller's own handling still runs — campaign sends rely on this to mark
    // a recipient as bounced.
    console.error(`Failed to send email to ${to}:`, err);
    // Keeps the mail server's answer (responseCode 550, code EENVELOPE...)
    // so a blast can tell a dead address from a temporary outage.
    const e = err as { responseCode?: number; code?: string; command?: string } | null;
    throw Object.assign(new Error(`Email send failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err }), {
      responseCode: e?.responseCode,
      code: e?.code,
      command: e?.command,
    });
  }
}
