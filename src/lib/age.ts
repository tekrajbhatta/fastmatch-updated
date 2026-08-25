// Age as of today, accounting for whether this year's birthday has
// happened yet — not just a year subtraction. Shared by registration
// (18+ check) and event booking (age-range check) so both agree on the
// same definition of "age".
export function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}
