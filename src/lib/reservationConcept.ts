/** URL hints select a preference only; they do not bypass availability or review. */
export function reservationConceptFromQuery(search: string): string {
  const value = new URLSearchParams(search).get("concept")?.trim().toLowerCase();
  return value && ["oku", "catch", "terrace", "vip"].includes(value) ? value : "";
}
