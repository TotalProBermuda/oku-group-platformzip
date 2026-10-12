import { describe, expect, it } from "vitest";
import { isSafeArtworkUrl, seriesArtworkCandidates, sessionArtworkCandidates } from "@/lib/eventArtwork";
import { parseArtworkEdit, artworkUploadSchema } from "@/server/series/artworkInput";
import { createSessionInputSchema, updateSessionContentSchema } from "@/server/series/createSessionInput";
import { createSeriesInputSchema } from "@/server/series/createSeriesInput";

const series = { heroImageUrl: "/legacy.jpg", heroImageUrlEn: "/en.jpg", heroImageUrlEs: "/es.jpg", heroImageUrlPt: "/pt.jpg" };
const session = { flyerImageUrl: "/session-legacy.jpg", flyerImageUrlEn: "/session-en.jpg", flyerImageUrlEs: "/session-es.jpg", flyerImageUrlPt: "/session-pt.jpg" };

describe("locale artwork selection", () => {
  it.each(["en", "es", "pt"])("selects matching %s series and session artwork", locale => {
    expect(seriesArtworkCandidates(series, locale)[0]).toBe(`/${locale}.jpg`);
    expect(sessionArtworkCandidates(session, locale)[0]).toBe(`/session-${locale}.jpg`);
  });
  it("falls back to English, then legacy; does not substitute another translation", () => {
    expect(seriesArtworkCandidates({ ...series, heroImageUrlEs: null }, "es")).toEqual(["/en.jpg", "/legacy.jpg"]);
    expect(seriesArtworkCandidates({ heroImageUrlPt: "/pt.jpg", heroImageUrl: "/legacy.jpg" }, "es")).toEqual(["/legacy.jpg"]);
    expect(sessionArtworkCandidates({ flyerImageUrl: "/legacy.jpg" }, "pt")).toEqual(["/legacy.jpg"]);
    expect(seriesArtworkCandidates({}, "pt")).toEqual([]);
    expect(seriesArtworkCandidates(series, "fr")[0]).toBe("/en.jpg");
  });
  it("retains ordered load-failure candidates, deduplicating and rejecting unsafe URLs", () => {
    expect(sessionArtworkCandidates(session, "pt", series)).toEqual([
      "/session-pt.jpg", "/session-en.jpg", "/session-legacy.jpg", "/pt.jpg", "/en.jpg", "/legacy.jpg",
    ]);
    expect(seriesArtworkCandidates({ heroImageUrlEs: "javascript:alert(1)", heroImageUrlEn: "/en.jpg", heroImageUrl: "/en.jpg" }, "es")).toEqual(["/en.jpg"]);
  });
  it.each(["javascript:alert(1)", "data:image/svg+xml,test", "//evil.test/x", "/\\evil.test/x", "http://evil.test/x", "https://user:pass@evil.test/x", "https://cdn.test/x?X-Goog-Signature=temporary", "https://cdn.test/x?Expires=123", "/bad\nurl"])("rejects unsafe/transient URL %s", value => {
    expect(isSafeArtworkUrl(value)).toBe(false);
    expect(() => parseArtworkEdit({ heroImageUrlEs: value }, ["SUPERADMIN"], "series")).toThrow();
  });
  it("accepts permanent asset URLs and same-origin media proxy paths", () => {
    expect(isSafeArtworkUrl("https://cdn.test/artwork.png")).toBe(true);
    expect(isSafeArtworkUrl("/api/v1/media/bucket/public/uploads/file.png")).toBe(true);
  });
});

describe("artwork input and permissions", () => {
  it.each(["FB_DIRECTOR", "PARTNER_ADMIN", "INFLUENCER", "CUSTOMER", "ADMIN_COMMERCIAL"])("rejects localized writes by %s, including removal", role => {
    for (const body of [{ heroImageUrlEs: "/es.jpg" }, { heroImageUrlEs: null }]) {
      try { parseArtworkEdit(body, [role], "series"); throw new Error("Expected denial"); }
      catch (error) { expect((error as { status?: number }).status).toBe(403); }
    }
    expect(() => parseArtworkEdit({ flyerImageUrlPt: "/pt.jpg" }, [role], "session")).toThrow();
    expect(parseArtworkEdit({ title: "Unrelated" }, [role], "series")).toEqual({});
  });
  it("allows clearing mobile artwork and restricts its changes to Superadmin", () => {
    expect(parseArtworkEdit({ flyerImageUrlMobileEs: "" }, ["SUPERADMIN"], "session")).toEqual({ flyerImageUrlMobileEs: null });
    expect(() => parseArtworkEdit({ flyerImageUrlMobileEs: "/es-mobile.jpg" }, ["FB_DIRECTOR"], "session")).toThrow();
    expect(updateSessionContentSchema.parse({ flyerImageUrlMobilePt: "" })).toEqual({ flyerImageUrlMobilePt: null });
  });
  it("normalizes removal and does not overwrite unspecified locales or legacy URLs", () => {
    expect(parseArtworkEdit({ heroImageUrlEs: " ", heroImageUrl: "/legacy.jpg" }, ["SUPERADMIN"], "series")).toEqual({ heroImageUrlEs: null });
    expect(updateSessionContentSchema.parse({ flyerImageUrlPt: "" })).toEqual({ flyerImageUrlPt: null });
  });
  it.each(["OKU", "CATCH", "PARTNER", "INFLUENCER"])("supports series creation for %s without a special event branch", hostType => {
    const result = createSeriesInputSchema.parse({ slug: "event-test", title: "Event", hostType, venueId: "venue-1", partnerId: "partner-1", influencerId: "influencer-1", heroImageUrlPt: "/pt.jpg" });
    expect(result.heroImageUrlPt).toBe("/pt.jpg");
  });
  it("accepts session creation with permanent upload paths", () => {
    expect(createSessionInputSchema.parse({ startsAt: "2027-01-01", endsAt: "2027-01-02", capacity: 5, flyerImageUrlEs: "/api/v1/media/bucket/public/uploads/es.png" }).flyerImageUrlEs).toContain("/es.png");
  });
  it("bounds uploads and excludes SVG, scripts, paths and missing sizes", () => {
    const valid = { filename: "es.png", contentType: "image/png", size: 100 };
    expect(artworkUploadSchema.safeParse(valid).success).toBe(true);
    for (const input of [{ ...valid, size: 0 }, { ...valid, size: 11 * 1024 * 1024 }, { ...valid, contentType: "image/svg+xml" }, { ...valid, filename: "../x.png" }, { filename: "x.png", contentType: "image/png" }]) {
      expect(artworkUploadSchema.safeParse(input).success).toBe(false);
    }
  });
});
