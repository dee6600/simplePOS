/**
 * Simple family login: each person types their own phone number and picks their name once.
 * The number is turned into a Firebase email/password login behind the scenes (no PIN, no SMS),
 * which gives each person a stable account. Deliberately simple, as the family asked: anyone with
 * this app who types any number can open the shop.
 *
 * This Firebase project holds exactly one shop (the family's), so everyone shares SHOP_ID.
 * Never change SHOP_ID, PERSON_SALT or the email format once in use: existing data/logins would be lost.
 */
export const SHOP_ID = 'main';
const PERSON_SALT = 'reddys-simplepos-v1';

/** Accepts "98765 43210", "+91 98765 43210", "098765 43210" → "919876543210". Null if not a mobile number. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `91${digits}`;
}

/** "919876543210" → "98765 43210" for display. */
export function formatPhone(normalized: string): string {
  const d = normalized.slice(-10);
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

export function personCredentials(normalized: string): { email: string; password: string } {
  return { email: `${normalized}@family.simplepos.app`, password: `${PERSON_SALT}:${normalized}` };
}
