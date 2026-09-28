import { describe, expect, it } from "vitest";
import { formatPanamaOperationalDate } from "@/lib/panamaDateTime";

describe("operational commerce alert dates", () => {
  it("renders reservation times in Panama rather than the server timezone", () => {
    const fivePmPanama = new Date("2026-09-28T22:00:00.000Z");

    expect(formatPanamaOperationalDate(fivePmPanama)).toBe("Mon, Sep 28, 2026, 5:00 PM");
  });
});
