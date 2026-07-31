import { emailLayout } from './layout';

export function welcomeVerificationEmail(opts: { memberName: string; verifyUrl: string }) {
  const html = emailLayout(`
    <h1 style="color:#3D1E6D;">Welcome to FastMatch, ${opts.memberName}!</h1>
    <p>Thanks for joining — you're one step away from booking your first event.</p>
    <p>Please confirm your email address to activate your membership:</p>
    <p><a href="${opts.verifyUrl}" style="background:#E1382E;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Confirm my email</a></p>
    <p>Once confirmed, you can browse and book events straight away.</p>
    <p>The FastMatch Team</p>
  `);

  return { subject: 'Confirm your FastMatch membership', html };
}
