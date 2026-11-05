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


describe("translation locale selection", () => {
  it("uses the locale selected by the localized site shell", async () => {
    const { resolveTranslationLocale } = await import("@/i18n/useTranslation");
    expect(resolveTranslationLocale("es", "en")).toBe("es");
    expect(resolveTranslationLocale("pt", "en")).toBe("pt");
  });

  it("keeps English for legacy surfaces outside the localized shell", async () => {
    const { resolveTranslationLocale } = await import("@/i18n/useTranslation");
    expect(resolveTranslationLocale(undefined, "en")).toBe("en");
  });
});
