import { describe, it, expect } from "vitest";
import { classifyCharge } from "@/server/payments/providers/chargeOutcome";
describe("immediate capture fulfilment decision", () => {
  it("accepts full authorization with a durable transaction reference", () => {
    expect(classifyCharge(201, { id: "txn", status: "AUTHORIZED" })).toBe("approved");
  });
  it.each(["PARTIAL_AUTHORIZED", "AUTHORIZED_PENDING_REVIEW", "PENDING", "TRANSMITTED", "UNKNOWN"])("holds %s for reconciliation", status => {
    expect(classifyCharge(201, { id: "txn", status })).toBe("review");
  });
  it("does not fulfil a reference-less success or ambiguous network result", () => {
    expect(classifyCharge(201, { status: "AUTHORIZED" })).toBe("review");
    expect(classifyCharge(null, null)).toBe("review");
    expect(classifyCharge(503, { id: "txn" })).toBe("review");
  });
  it("rejects definitive request failures", () => expect(classifyCharge(400, { status: "INVALID_REQUEST" })).toBe("failed"));
});
