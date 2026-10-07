/**
 * A member's details as the admin's booking screens show them. Picked field
 * by field: a whole member row carries the password hash and the pending
 * mobile code, which must never reach a browser, the admin's included.
 */
export const BOOKING_MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  mobile: true,
  gender: true,
  dateOfBirth: true,
} as const;
