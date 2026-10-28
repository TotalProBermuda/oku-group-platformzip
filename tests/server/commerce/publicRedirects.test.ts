import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => { throw new Error(`REDIRECT:${destination}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import sessionAlias from "@/app/[locale]/experiences/[slug]/sessions/[sessionId]/page";
import legacyCheckout from "@/app/series/[slug]/checkout/page";
import localizedLegacyCheckout from "@/app/[locale]/series/[slug]/checkout/page";

const slug = "wine-down-wednesday";
const sessionId = "cmv1ohwb40006w3f2woikjbnk";

describe("public experience and legacy checkout redirects (no database)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("redirects the exact reported session URL to the existing focused view", async () => {
    await expect(sessionAlias({ params: Promise.resolve({ locale: "en", slug, sessionId }) }))
      .rejects.toThrow(`REDIRECT:/en/experiences/${slug}?sessionId=${sessionId}#sessions`);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(`/en/experiences/${slug}?sessionId=${sessionId}#sessions`);
  });

  it.each(["en", "es", "pt"] as const)("preserves %s and query context with the path session authoritative", async locale => {
    await expect(sessionAlias({
      params: Promise.resolve({ locale, slug: "another-experience", sessionId: "another-session" }),
      searchParams: Promise.resolve({ sessionId: ["wrong", "also-wrong"], ref: "a & b", tag: ["one", "two"], empty: "", absent: undefined }),
    })).rejects.toThrow("REDIRECT:");
    const url = new URL(mocks.redirect.mock.calls[0][0], "https://example.test");
    expect(url.pathname).toBe(`/${locale}/experiences/another-experience`);
    expect(url.searchParams.getAll("sessionId")).toEqual(["another-session"]);
    expect(url.searchParams.get("ref")).toBe("a & b");
    expect(url.searchParams.getAll("tag")).toEqual(["one", "two"]);
    expect(url.searchParams.get("empty")).toBe("");
    expect(url.searchParams.has("absent")).toBe(false);
    expect(url.hash).toBe("#sessions");
  });

  it.each(["en", "es", "pt"])("forwards a selected session and query context through the %s wrapper", async locale => {
    expect(localizedLegacyCheckout).toBe(legacyCheckout);
    await expect(localizedLegacyCheckout({
      params: Promise.resolve({ locale, slug }),
      searchParams: Promise.resolve({ sessionId, ref: "a & b", tag: ["one", "two"], empty: "", absent: undefined }),
    })).rejects.toThrow("REDIRECT:");
    const url = new URL(mocks.redirect.mock.calls[0][0], "https://example.test");
    expect(url.pathname).toBe(`/${locale}/checkout/${slug}`);
    expect(url.searchParams.get("sessionId")).toBe(sessionId);
    expect(url.searchParams.get("ref")).toBe("a & b");
    expect(url.searchParams.getAll("tag")).toEqual(["one", "two"]);
    expect(url.searchParams.get("empty")).toBe("");
    expect(url.searchParams.has("absent")).toBe(false);
  });

  it.each(["en", "es", "pt"])("leaves session selection to canonical checkout when absent in %s", async locale => {
    await expect(localizedLegacyCheckout({
      params: Promise.resolve({ locale, slug }),
      searchParams: Promise.resolve({ ref: "newsletter" }),
    })).rejects.toThrow(`REDIRECT:/${locale}/checkout/${slug}?ref=newsletter`);
    expect(mocks.redirect.mock.calls[0][0]).not.toContain("sessionId");
  });

  it("supports unprefixed legacy checkout without inventing a session or query string", async () => {
    await expect(legacyCheckout({ params: Promise.resolve({ slug }) }))
      .rejects.toThrow(`REDIRECT:/en/checkout/${slug}`);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(`/en/checkout/${slug}`);
  });

  it("encodes path segments rather than treating them as query or hash context", async () => {
    await expect(sessionAlias({
      params: Promise.resolve({ locale: "en", slug: "a?b#c", sessionId: "s&x=1" }),
    })).rejects.toThrow("REDIRECT:/en/experiences/a%3Fb%23c?sessionId=s%26x%3D1#sessions");
    await expect(legacyCheckout({ params: Promise.resolve({ locale: "pt", slug: "a?b#c" }) }))
      .rejects.toThrow("REDIRECT:/pt/checkout/a%3Fb%23c");
  });

  it("removes the public demo UI and submission instead of hiding its button", () => {
    const source = readFileSync("src/app/series/[slug]/checkout/page.tsx", "utf8");
    expect(source).not.toMatch(/use client|fetch\s*\(|\/api\/v1\/checkout\/demo|completeDemoPurchase|Complete Demo Purchase|handlePurchase|<button|<form/);
    expect(source).toContain("redirect(");
  });
});
