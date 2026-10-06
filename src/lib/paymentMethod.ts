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

/**
 * A booking's status as the admin screens show it. A refunded one reads
 * "Cancelled – refunded": refunded automatically when its event was cancelled
 * (its card payment, src/lib/cancelEvent.ts), or marked so by hand; plain
 * "Cancelled" means nothing went back automatically (Gil, Q2; the user, 6 Oct).
 */
export function bookingStatusLabel(status: string, paidAmountLabel: string): string {
  if (status === 'CONFIRMED') return `Paid ${paidAmountLabel}`;
  if (status === 'REFUNDED') return 'Cancelled – refunded';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'PENDING') return 'Pending';
  return status;
}
