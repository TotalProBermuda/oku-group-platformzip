/**
 * Interpolates translation strings with variable values.
 *
 * Usage:
 *   interpolate("Welcome, {name}!", { name: "Denzil" })
 *   // → "Welcome, Denzil!"
 *
 *   interpolate("{pct}% of your fee goes to AVACA", { pct: 15 })
 *   // → "15% of your fee goes to AVACA"
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}
