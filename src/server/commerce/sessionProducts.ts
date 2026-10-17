import { modes } from "@/server/series/sessionFields";

/** Session availability is a narrowing layer. It never activates an inactive catalogue product. */
export function sessionProductEnabled(session: { fieldModes?: unknown }, series: { sessionDefaults?: unknown }, ticketTypeId: string) {
  const key = `ticket.${ticketTypeId}.enabled`;
  const edit = modes(session.fieldModes)[key];
  if (edit?.mode === "override") return edit.value === true;
  if (edit?.mode === "clear") return false;
  const inherited = modes(series.sessionDefaults)[key];
  return inherited?.mode === "override" ? inherited.value === true : inherited?.mode !== "clear";
}
export function purchasedEntitlements(session: { giftBagEnabled: boolean }) {
  return { version: 1, admission: true, giftBag: session.giftBagEnabled };
}
export function ticketGiftBagEntitlement(ticket: { entitlementSnapshot?: unknown; session?: { giftBagEnabled?: boolean } | null }) {
  const snapshot = ticket.entitlementSnapshot;
  if (snapshot && typeof snapshot === "object" && "giftBag" in snapshot) return snapshot.giftBag === true;
  return ticket.session?.giftBagEnabled === true;
}
