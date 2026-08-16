import { describe, expect, it } from "vitest";
import { timeWindowsOverlap } from "@/server/events/eventOccupancyService";

describe("event occupancy time windows", () => {
  const at = (hour: number) => new Date(`2026-08-16T${String(hour).padStart(2, "0")}:00:00.000Z`);

  it("treats touching end and start times as available", () => {
    expect(timeWindowsOverlap(at(10), at(11), at(11), at(12))).toBe(false);
  });

  it("detects an overlap in either direction", () => {
    expect(timeWindowsOverlap(at(10), at(12), at(11), at(13))).toBe(true);
    expect(timeWindowsOverlap(at(11), at(13), at(10), at(12))).toBe(true);
  });
});
