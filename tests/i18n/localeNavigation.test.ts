import { describe, expect, it } from "vitest";
import { localizedPathWithState } from "@/i18n/localeNavigation";

describe("locale navigation", () => {
  it("keeps the selected session and anchor while changing languages", () => {
    expect(localizedPathWithState(
      "/en/experiences/wine-down-wednesday",
      "es",
      "?sessionId=session-123",
      "#session-session-123",
    )).toBe("/es/experiences/wine-down-wednesday?sessionId=session-123#session-session-123");
  });

  it("keeps checkout query state when switching languages", () => {
    expect(localizedPathWithState("/en/checkout/wine-down-wednesday", "pt", "?sessionId=session-123"))
      .toBe("/pt/checkout/wine-down-wednesday?sessionId=session-123");
  });
});
