export function verificationCodeSms(code: string) {
  // There's no app: the code goes into the website's "Verify your mobile" page.
  return `Your FastMatch verification code is ${code}. Enter it on the FastMatch website to verify your mobile.`;
}
