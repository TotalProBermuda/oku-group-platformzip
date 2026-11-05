import { describe, expect, it } from "vitest";
import { createCheckoutContinuation, isConfirmedCheckout, isVerificationReturn } from "@/lib/checkoutContinuation";

describe("checkout continuation safeguards", () => {
  it("locks synchronously against double-clicks and releases on completion", () => {
    const flow = createCheckoutContinuation();
    expect(flow.begin()).toBe(true);
    expect(flow.begin()).toBe(false);
    flow.finish();
    expect(flow.begin()).toBe(true);
  });
  it("continues each returned challenge at most once, even after a failure", () => {
    const flow = createCheckoutContinuation();
    flow.begin();
    expect(flow.claimReturn("challenge")).toBe(false);
    flow.finish();
    expect(flow.claimReturn("challenge")).toBe(true);
    expect(flow.claimReturn("challenge")).toBe(false);
    flow.begin(); flow.finish();
    expect(flow.claimReturn("challenge")).toBe(false);
    expect(flow.claimReturn("")).toBe(false);
  });
  it("requires the expected frame, same origin and callback type", () => {
    const frame = {};
    const event = { origin: "https://oku.example", source: frame, data: { type: "oku-3ds-complete" } };
    expect(isVerificationReturn(event, event.origin, frame)).toBe(true);
    expect(isVerificationReturn({ ...event, origin: "https://evil.example" }, event.origin, frame)).toBe(false);
    expect(isVerificationReturn({ ...event, source: {} }, event.origin, frame)).toBe(false);
    expect(isVerificationReturn({ ...event, data: null }, event.origin, frame)).toBe(false);
    expect(isVerificationReturn({ ...event, source: null }, event.origin, null)).toBe(false);
  });
  it("requires explicit server confirmation, not just a successful HTTP response", () => {
    expect(isConfirmedCheckout(200, { ok: true, data: { orderId: "isolated-order" } })).toBe(true);
    for (const status of [202, 400, 402, 409, 500]) {
      expect(isConfirmedCheckout(status, { ok: true, data: { orderId: "isolated-order" } })).toBe(false);
    }
    for (const body of [null, {}, { ok: true }, { ok: false, data: { orderId: "x" } }]) {
      expect(isConfirmedCheckout(200, body)).toBe(false);
    }
  });
});
