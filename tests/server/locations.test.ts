import { describe, expect, it } from "vitest";
import { normalizeSpaceConceptKey, seriesLocationLabel } from "@/lib/locations";

describe("operational venue and physical-space model", () => {
  it("creates stable keys for named physical spaces", () => {
    expect(normalizeSpaceConceptKey("OKÜ Dining Room")).toBe("OKU_DINING_ROOM");
    expect(normalizeSpaceConceptKey("Private Dining Room")).toBe("PRIVATE_DINING_ROOM");
    expect(normalizeSpaceConceptKey("The Terrace")).toBe("THE_TERRACE");
  });

  it("labels a series with its physical space before its venue", () => {
    expect(seriesLocationLabel({ eventSpace: { name: "The Terrace" }, operationalVenue: { name: "OKÜ Hospitality" }, venue: "OKU" })).toBe("The Terrace");
    expect(seriesLocationLabel({ operationalVenue: { name: "OKÜ Hospitality" }, venue: "OKU" })).toBe("OKÜ Hospitality");
    expect(seriesLocationLabel({ venue: "CATCH" })).toBe("CATCH");
  });
});
