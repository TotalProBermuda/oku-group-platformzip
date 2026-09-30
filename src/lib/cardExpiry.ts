/** Keep incomplete expiry input as entered; never prepend a century while editing. */
export function formatCardExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
}

export function parseCardExpiry(value: string, now = new Date()) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{4}$/.test(digits)) return null;
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2));
  if (month < 1 || month > 12) return null;
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return null;
  return { expirationMonth: digits.slice(0, 2), expirationYear: String(year) };
}
