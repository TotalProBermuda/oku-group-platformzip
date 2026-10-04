import { describe, expect, it } from "vitest";
import { admitRefund, type RefundOperation, type RefundState } from "@/server/payments/refundAdmission";
const request = { key: "new", amountCents: 600, currency: "USD", fingerprint: "payment-and-entitlement-scope" };
const op = (state: RefundState, amountCents = 500): RefundOperation => ({ ...request, key: "old", state, amountCents });

describe("durable refund admission rules (pure model, not DB concurrency proof)", () => {
  it.each(["RESERVED", "SUBMITTED", "UNKNOWN", "SETTLED"] as RefundState[])("%s reserves balance", state => {
    expect(admitRefund(1000, "USD", [op(state)], request)).toEqual({ kind: "REJECT", reason: "INSUFFICIENT_BALANCE" });
  });
  it("definitive failure releases balance", () => {
    expect(admitRefund(1000, "USD", [op("FAILED")], request)).toEqual({ kind: "NEW", remainingCents: 400 });
  });
  it("cumulative partial refunds can exactly exhaust balance", () => {
    expect(admitRefund(1000, "USD", [op("SETTLED", 400)], request)).toEqual({ kind: "NEW", remainingCents: 0 });
  });
  it.each(["RESERVED", "SUBMITTED", "UNKNOWN", "SETTLED", "FAILED"] as RefundState[])("same %s operation replays without submission", state => {
    const previous = { ...request, state };
    expect(admitRefund(1000, "USD", [previous], request)).toEqual({ kind: "REPLAY", operation: previous });
  });
  it.each([{ amountCents: 601 }, { fingerprint: "different-ticket-scope" }])("key binds immutable request %j", change => {
    expect(admitRefund(1000, "USD", [{ ...request, state: "UNKNOWN" }], { ...request, ...change }))
      .toEqual({ kind: "REJECT", reason: "KEY_CONFLICT" });
  });
  it.each([0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe amount %s", amountCents => {
    expect(admitRefund(1000, "USD", [], { ...request, amountCents })).toMatchObject({ kind: "REJECT", reason: "INVALID_INPUT" });
  });
  it("does not cross currencies", () => {
    expect(admitRefund(1000, "EUR", [], request)).toMatchObject({ kind: "REJECT" });
  });
  it.each([{ history: [op("SETTLED"), op("UNKNOWN")] }, { history: [op("SETTLED", 1001)] }])("fails closed on corrupt history", ({ history }) => {
    expect(admitRefund(1000, "USD", history, request)).toEqual({ kind: "REJECT", reason: "INVALID_HISTORY" });
  });
  it("second serialized reservation cannot spend the same remaining balance", () => {
    expect(admitRefund(1000, "USD", [], request).kind).toBe("NEW");
    expect(admitRefund(1000, "USD", [{ ...request, state: "RESERVED" }], { ...request, key: "second" }))
      .toEqual({ kind: "REJECT", reason: "INSUFFICIENT_BALANCE" });
  });
});
