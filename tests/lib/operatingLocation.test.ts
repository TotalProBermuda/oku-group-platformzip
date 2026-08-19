import { describe, expect, it } from "vitest";
import { LOCAL5_OPERATING_LOCATION, LOCAL5_SPACE_SPECS } from "@/lib/operatingLocation";

describe("Local #5 operating-location baseline", () => {
  it("keeps the building separate from the operating location", () => {
    expect(LOCAL5_OPERATING_LOCATION.operatingName).toBe("Local #5");
    expect(LOCAL5_OPERATING_LOCATION.buildingName).toBe("Gold House / Casa Oro");
  });

  it("defines the four physical spaces with stable unique keys", () => {
    expect(LOCAL5_SPACE_SPECS.map((space) => space.conceptKey)).toEqual([
      "OKU",
      "CATCH",
      "TERRACE",
      "PRIVATE_DINING_ROOM",
    ]);
    expect(new Set(LOCAL5_SPACE_SPECS.map((space) => space.conceptKey)).size).toBe(4);
    expect(LOCAL5_SPACE_SPECS.find((space) => space.conceptKey === "PRIVATE_DINING_ROOM"))
      .toMatchObject({ name: "Private Dining Room", requiresApproval: true });
  });
});
