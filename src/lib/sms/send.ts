/**
 * Central SMS send function, mirroring src/lib/emails/send.ts. Every SMS in
 * the app goes through here — verification codes, event-change alerts, and
 * blast batches alike.
 *
 * Both providers from the "Decisions needed" list are actually implemented
 * — Clickatell (matches the old site) and Twilio — switched by
 * SMS_PROVIDER env var, so the code isn't blocked on that decision
 * anymore, only the account/key is. Defaults to Twilio if unset but a key
 * exists, since Twilio's API needs no extra provider-specific setup beyond
 * the account itself.
 *
 * Falls back to a console.log stub if no key is set, so local development
 * never accidentally texts anyone.
 */

interface SendSmsArgs {
  to: string;
  body: string;
}

export async function sendSms({ to, body }: SendSmsArgs) {
  if (!process.env.SMS_PROVIDER_API_KEY) {
    console.log(`[stub] Would SMS ${to}: "${body}"`);
    return;
  }

  const provider = (process.env.SMS_PROVIDER || 'TWILIO').toUpperCase();

  if (provider === 'CLICKATELL') {
    await sendViaClickatell(to, body);
  } else {
    await sendViaTwilio(to, body);
  }
}

async function sendViaTwilio(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !fromNumber) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_FROM_NUMBER must both be set when SMS_PROVIDER=TWILIO.');
  }

  const twilio = (await import('twilio')).default;
  const client = twilio(accountSid, process.env.SMS_PROVIDER_API_KEY);

  try {
    await client.messages.create({ to, from: fromNumber, body });
  } catch (err) {
    console.error(`Failed to SMS ${to} via Twilio:`, err);
    throw new Error('SMS send failed');
  }
}

async function sendViaClickatell(to: string, body: string) {
  // Clickatell's REST API — simple bearer-token POST, no SDK needed.
  const res = await fetch('https://platform.clickatell.com/messages', {
    method: 'POST',
    headers: {
      Authorization: process.env.SMS_PROVIDER_API_KEY as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: body, to: [to] }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed to SMS ${to} via Clickatell:`, res.status, text);
    throw new Error('SMS send failed');
  }
}
