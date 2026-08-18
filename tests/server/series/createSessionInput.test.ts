import { describe, expect, it } from "vitest";
import { createSessionInputSchema } from "@/server/series/createSessionInput";

describe("createSessionInputSchema", () => {
  const valid = { title: "Terrace dinner", startsAt: "2026-09-01T18:00:00.000Z", endsAt: "2026-09-01T21:00:00.000Z", capacity: 40 };

  it("accepts a valid event and converts dates", () => {
    const result = createSessionInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected event input to be valid.");
    expect(result.data.startsAt).toBeInstanceOf(Date);
    expect(result.data.capacity).toBe(40);
  });

  it("rejects an end time before the start time", () => {
    const result = createSessionInputSchema.safeParse({ ...valid, endsAt: "2026-09-01T17:00:00.000Z" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid timing.");
    expect(result.error.flatten().fieldErrors.endsAt).toContain("End time must be after the start time.");
  });

  it("rejects invalid capacity", () => {
    expect(createSessionInputSchema.safeParse({ ...valid, capacity: 0 }).success).toBe(false);
    expect(createSessionInputSchema.safeParse({ ...valid, capacity: 2.5 }).success).toBe(false);
    expect(createSessionInputSchema.safeParse({ ...valid, capacity: 100001 }).success).toBe(false);
  });
});
