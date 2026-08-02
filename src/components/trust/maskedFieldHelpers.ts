export function formatMaskedDisplay(last4: string | null | undefined, placeholder = "••••"): string {
  const digits = (last4 ?? "").replace(/\D/g, "").slice(-4);
  return digits ? `•••• ${digits}` : placeholder;
}

export function spacedDigitsForScreenReader(last4: string | null | undefined): string {
  return (last4 ?? "").replace(/\D/g, "").slice(-4).split("").join(" ");
}

export function ariaLabelEndingIn(
  fieldName: string,
  last4: string | null | undefined,
): string {
  const digits = spacedDigitsForScreenReader(last4);
  if (!digits) return `${fieldName} not set`;
  return `${fieldName} ending in ${digits}`;
}

export function lastFourFromInput(input: string): string {
  return input.replace(/\D/g, "").slice(-4);
}

export function applyReplacement(_previous: string | null, next: string): string {
  return next;
}
