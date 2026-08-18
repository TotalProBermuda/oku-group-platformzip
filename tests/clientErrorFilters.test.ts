import { describe, expect, it } from "vitest";
import { isKnownInjectedExtensionError } from "@/lib/clientErrorFilters";

describe("isKnownInjectedExtensionError", () => {
  it("recognizes the injected MetaMask connection failure", () => {
    expect(isKnownInjectedExtensionError({
      message: "Failed to connect to MetaMask",
      stack: "Object.connect chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js (7:84292)",
    })).toBe(true);
  });

  it("does not hide application or unrelated extension errors", () => {
    expect(isKnownInjectedExtensionError({
      message: "Failed to connect to MetaMask",
      stack: "at connect (/app/wallet.ts:12:2)",
    })).toBe(false);
    expect(isKnownInjectedExtensionError({
      message: "Extension exploded",
      filename: "chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js",
    })).toBe(false);
  });
});
