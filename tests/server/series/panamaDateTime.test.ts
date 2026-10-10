import { describe, expect, it } from "vitest";
import { panamaDateTimeLocalInput, panamaDateTimeLocalIso } from "@/lib/panamaDateTime";

describe("series session Panama-local date/time", () => {
  it("converts an event wall-clock time to the correct UTC instant", () => {
    expect(panamaDateTimeLocalIso("2026-10-21T18:00")).toBe("2026-10-21T23:00:00.000Z");
  });

  it("shows the same Panama wall-clock value regardless of the device timezone", () => {
    expect(panamaDateTimeLocalInput(new Date("2026-10-21T23:00:00.000Z"))).toBe("2026-10-21T18:00");
  });

  it("rejects malformed local date/time strings", () => {
    expect(() => panamaDateTimeLocalIso("2026-10-21 18:00")).toThrow("Choose a valid Panama date and time.");
  });
});
