import { describe, it, expect } from "vitest";
import { ticketRows } from "@/server/commerce/ticketIssuance";
describe("ticket entitlement issuance", () => {
  const order = { id: "o", userId: "u", sessionId: "s", user: { name: "Buyer", email: "Buyer@example.com" }, lineItems: [{ ticketTypeId: "vip", qty: 2 }, { ticketTypeId: null, qty: 3 }, { ticketTypeId: "ga", qty: 1 }] };
  it("retains ticket type and excludes add-ons", () => {
    const rows = ticketRows(order);
    expect(rows.map(r => r.ticketTypeId)).toEqual(["vip", "vip", "ga"]);
    expect(new Set(rows.map(r => r.code)).size).toBe(3);
    expect(rows[0].sessionId).toBe("s");
  });
  it("does not issue admissions for add-on-only orders", () => expect(ticketRows({ ...order, lineItems: [{ ticketTypeId: null, qty: 2 }] })).toEqual([]));
  it("rejects invalid quantities", () => expect(() => ticketRows({ ...order, lineItems: [{ ticketTypeId: "vip", qty: -1 }] })).toThrow());
});
