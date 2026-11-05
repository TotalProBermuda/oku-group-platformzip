export function partnerIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("partnerId");
}
