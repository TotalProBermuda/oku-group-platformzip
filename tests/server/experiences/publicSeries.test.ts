import { describe, expect, it, vi } from "vitest";
import { SeriesStatus, SeriesVisibilityMode } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    series: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { publicSeriesWhere } from "@/server/experiences/publicSeries";

describe("publicSeriesWhere", () => {
  it("cannot be widened to expose drafts or private records", () => {
    expect(
      publicSeriesWhere({
        slug: "private-draft",
        status: SeriesStatus.DRAFT,
        seriesVisibilityMode: SeriesVisibilityMode.PRIVATE_HIDDEN,
      }),
    ).toEqual({
      slug: "private-draft",
      status: { in: [SeriesStatus.PUBLISHED, SeriesStatus.SOLD_OUT] },
      seriesVisibilityMode: { not: SeriesVisibilityMode.PRIVATE_HIDDEN },
    });
  });
});
