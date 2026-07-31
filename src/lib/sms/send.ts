/**
 * Central SMS send function, mirroring src/lib/emails/send.ts. Every SMS in
 * the app goes through here — booking-related reminders and admin campaigns
 * alike — so there's one place to wire up the actual provider.
 *
 * Provider TBD: Clickatell (matches the old site) or Twilio.
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

  // TODO: wire up to Clickatell or Twilio once the provider is chosen.
}
