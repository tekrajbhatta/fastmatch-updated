/**
 * The "Payment Status" options on the admin Add booking / Add member screens,
 * in the order Gil listed them. Plain strings rather than the Prisma enum so
 * client components can import this without pulling in @prisma/client.
 */
export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Charge credit card' },
  { value: 'PAY_AT_DOOR', label: 'Pay at door' },
  { value: 'FRIEND_BOOKED_IN', label: 'Friend booked in' },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]['value'];

export const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as [PaymentMethodValue, ...PaymentMethodValue[]];

/** Short label for the bookings table. NULL = the member booked online. */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return 'Online';
  if (method === 'CARD') return 'Credit card';
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}
