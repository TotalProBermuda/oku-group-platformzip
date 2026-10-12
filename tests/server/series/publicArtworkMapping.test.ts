import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({
  series: { findMany: vi.fn() }, session: { findMany: vi.fn() }, contentTranslation: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { GET as sessionsGET } from "@/app/api/v1/sessions/route";
import { GET as seriesGET } from "@/app/api/v1/series/route";
import { GET as experiencesGET } from "@/app/api/v1/experiences/route";
const session = { id: "session-1", flyerImageUrl: "/legacy-flyer.jpg", flyerImageUrlEn: "/flyer-en.jpg", flyerImageUrlEs: "/flyer-es.jpg", flyerImageUrlPt: "/flyer-pt.jpg" };
const series = { id: "series-1", heroImageUrl: "/legacy-hero.jpg", heroImageUrlEn: "/hero-en.jpg", heroImageUrlEs: "/hero-es.jpg", heroImageUrlPt: "/hero-pt.jpg", sessions: [session] };
beforeEach(() => {
  vi.clearAllMocks();
  db.series.findMany.mockResolvedValue([series]);
  db.session.findMany.mockResolvedValue([{ ...session, series }]);
  db.contentTranslation.findMany.mockResolvedValue([]);
});
describe("public artwork data mapping remains backward compatible", () => {
  it.each(["en", "es", "pt"])("series API retains all artwork and legacy fields in %s", async locale => {
    const response = await seriesGET(new Request(`http://localhost/api/v1/series?locale=${locale}`));
    expect((await response.json()).data[0]).toEqual(series);
  });
  it("experience detail/list API carries series and session localized fields without remapping legacy", async () => {
    const response = await experiencesGET(new NextRequest("http://localhost/api/v1/experiences?slug=example"));
    expect((await response.json()).series[0]).toEqual(series);
    expect(db.series.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ sessions: expect.any(Object) }) }));
  });
  it("calendar API explicitly selects all six localized columns", async () => {
    const response = await sessionsGET(new NextRequest("http://localhost/api/v1/sessions"));
    expect((await response.json()).sessions[0]).toMatchObject({ ...session, series });
    expect(db.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        flyerImageUrlEn: true, flyerImageUrlEs: true, flyerImageUrlPt: true,
        series: { select: expect.objectContaining({ heroImageUrlEn: true, heroImageUrlEs: true, heroImageUrlPt: true, heroImageUrl: true }) },
      }),
    }));
  });
});
