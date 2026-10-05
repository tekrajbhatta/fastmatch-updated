/**
 * A price as members and the admin see it: "$49" for whole dollars, "$49.50"
 * otherwise, and a discount as "−$10". Prices used to come out however the
 * number happened to print ("$49.5", "$49.00"). The reports keep their own
 * accounting format, cents always shown, so their columns line up.
 */
export function formatPrice(value: number | string): string {
  const n = Number(value);
  const cents = Math.round(Math.abs(n) * 100);
  const digits = cents % 100 === 0 ? 0 : 2;
  const body = (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 && cents > 0 ? '−' : ''}$${body}`;
}
