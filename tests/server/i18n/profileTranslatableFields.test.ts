import { describe, expect, it } from "vitest";
import { isTranslatableField } from "@/config/translatableFields";

describe("public event host profile localization", () => {
  it("registers the profile text fields used on session pages", () => {
    expect(isTranslatableField("Profile", "displayName")).toBe(true);
    expect(isTranslatableField("Profile", "bio")).toBe(true);
    expect(isTranslatableField("Profile", "shortDescription")).toBe(true);
    expect(isTranslatableField("Profile", "websiteUrl")).toBe(false);
  });
});
