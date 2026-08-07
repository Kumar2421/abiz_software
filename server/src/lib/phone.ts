/**
 * Normalises a phone number to bare E.164 digits (no `+`, no spaces), which is
 * the format the Meta Cloud API uses for `wa_id`. Storing one canonical form
 * keeps `contacts (company_id, phone)` a reliable unique key.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "").replace(/^0+/, "");
  return digits;
}

export function isValidPhone(input: string): boolean {
  const digits = normalizePhone(input);
  return digits.length >= 8 && digits.length <= 15;
}

/** "+91 98765 43210" for display. */
export function formatPhone(digits: string): string {
  if (digits.length <= 10) return `+${digits}`;
  const cc = digits.slice(0, digits.length - 10);
  const rest = digits.slice(-10);
  return `+${cc} ${rest.slice(0, 5)} ${rest.slice(5)}`;
}
