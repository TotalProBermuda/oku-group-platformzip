import { describe, expect, it } from "vitest";
import { seriesSocialLinksSchema } from "@/lib/socialLinks";

describe("seriesSocialLinksSchema", () => {
  it("keeps secure, supported series links and removes blank entries", () => {
    expect(seriesSocialLinksSchema.parse({ website: "https://example.com", instagram: "https://instagram.com/winedown", facebook: "" })).toEqual({
      website: "https://example.com", instagram: "https://instagram.com/winedown",
    });
  });

  it("rejects insecure, malformed and unknown link fields", () => {
    expect(seriesSocialLinksSchema.safeParse({ instagram: "http://instagram.com/winedown" }).success).toBe(false);
    expect(seriesSocialLinksSchema.safeParse({ tiktok: "javascript:alert(1)" }).success).toBe(false);
    expect(seriesSocialLinksSchema.safeParse({ custom: "https://example.com" }).success).toBe(false);
  });
});
