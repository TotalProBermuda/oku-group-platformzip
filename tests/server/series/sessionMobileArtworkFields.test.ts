import { describe, expect, it } from "vitest";
import { fieldDefinition, managementInputSchema } from "@/server/series/sessionFields";

describe("session-specific mobile artwork management", () => {
  it("accepts only secure localized flyer URLs as restricted date overrides", () => {
    expect(fieldDefinition("artworkMobile.es")).toMatchObject({ clear: true, restricted: true });
    expect(managementInputSchema.safeParse({
      kind: "sessions",
      sessionIds: ["session-1"],
      patch: { "artworkMobile.es": { mode: "override", value: "/api/v1/media/public/es-mobile.jpg" } },
    }).success).toBe(true);
    expect(managementInputSchema.safeParse({
      kind: "sessions",
      sessionIds: ["session-1"],
      patch: { "artworkMobile.es": { mode: "override", value: "javascript:alert(1)" } },
    }).success).toBe(false);
  });

  it("does not allow mobile artwork to become a series default", () => {
    expect(managementInputSchema.safeParse({
      kind: "defaults",
      sessionIds: [],
      patch: { "artworkMobile.pt": { mode: "override", value: "/pt-mobile.jpg" } },
    }).success).toBe(false);
  });
});
