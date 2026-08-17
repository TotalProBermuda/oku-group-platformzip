import { describe, expect, it } from "vitest";

import { createSeriesInputSchema } from "@/server/series/createSeriesInput";

describe("createSeriesInputSchema", () => {
  const baseInput = {
    title: "Test Event 1",
    hostType: "OKU" as const,
    venue: "OKU" as const,
  };

  it("normalizes mixed-case slugs before validating", () => {
    const result = createSeriesInputSchema.safeParse({
      ...baseInput,
      slug: " Test-Event-1 ",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected mixed-case slug to be valid.");
    expect(result.data.slug).toBe("test-event-1");
  });

  it("rejects separators other than hyphens", () => {
    expect(
      createSeriesInputSchema.safeParse({ ...baseInput, slug: "Test Event 1" }).success,
    ).toBe(false);
  });
});
