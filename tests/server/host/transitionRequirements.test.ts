import { describe, expect, it } from "vitest";
import { assertTransitionOperationalRequirements } from "@/server/host/transitionRequirements";

const pendingApproval = {
  status: "PENDING_APPROVAL" as const,
  assignedSpaceId: null,
  requestedSpaceId: "space-oku",
  assignedTableLabel: null,
};

describe("reservation transition operational requirements", () => {
  it("confirms an advance request with space and time but no table", () => {
    expect(() => assertTransitionOperationalRequirements(pendingApproval, "CONFIRMED", {
      reservationDate: "2026-09-02T23:00:00.000Z",
    })).not.toThrow();
  });

  it("still requires a final dining space for advance confirmation", () => {
    expect(() => assertTransitionOperationalRequirements(
      { ...pendingApproval, requestedSpaceId: null }, "CONFIRMED",
      { reservationDate: "2026-09-02T23:00:00.000Z" },
    )).toThrow("Choose a final dining space");
  });

  it("still requires an exact table when the guest is seated", () => {
    expect(() => assertTransitionOperationalRequirements(
      { ...pendingApproval, status: "ARRIVED" }, "SEATED",
    )).toThrow("tableLabel is required");
  });

  it("accepts a seating table supplied by the host", () => {
    expect(() => assertTransitionOperationalRequirements(
      { ...pendingApproval, status: "ARRIVED" }, "SEATED", { tableLabel: "OKU-12" },
    )).not.toThrow();
  });
});
