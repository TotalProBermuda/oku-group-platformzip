/** Keep incoming attribution/context while making the rendered session authoritative. */
export function sessionCheckoutHref(
  base: string,
  sessionId: string,
  query: Record<string, string | string[] | undefined> = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      search.append(key, item);
    }
  }
  search.set("sessionId", sessionId);
  return `${base}?${search}`;
}
