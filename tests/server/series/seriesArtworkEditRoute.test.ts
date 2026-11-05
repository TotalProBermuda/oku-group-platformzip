import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: auth.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/server/series/publicationLifecycle", () => ({
  assertSeriesReadyForPublication: vi.fn(), syncSeriesOccupanciesForStatus: vi.fn(), SeriesPublicationError: class extends Error {},
}));
const db = vi.hoisted(() => {
  const tx = { $queryRaw: vi.fn(), series: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) }, auditLog: { create: vi.fn() } };
  return { tx, prisma: { series: { findUnique: vi.fn() }, $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));
import { PATCH } from "@/app/api/v1/admin/experiences/[id]/route";
const request = (body: unknown) => new NextRequest("http://localhost/api/v1/admin/experiences/series-1", { method: "PATCH", body: JSON.stringify(body) });
const context = () => ({ params: Promise.resolve({ id: "series-1" }) });
beforeEach(() => {
  vi.clearAllMocks();
  auth.getServerSession.mockResolvedValue({ user: { id: "admin-1", roles: ["SUPERADMIN"] } });
  db.prisma.series.findUnique.mockResolvedValue({ venueId: null, spaceId: null, hostType: "OKU", partnerId: null, influencerId: null });
  db.tx.series.update.mockResolvedValue({ id: "series-1", heroImageUrlEs: "/es.jpg" });
});
describe("series artwork edit endpoint", () => {
  it.each(["FB_DIRECTOR", "ADMIN_COMMERCIAL", "PARTNER_ADMIN", "INFLUENCER", "CUSTOMER"])("rejects localized writes by %s", async role => {
    auth.getServerSession.mockResolvedValue({ user: { id: "other-1", roles: [role] } });
    expect((await PATCH(request({ heroImageUrlEs: "/es.jpg" }), context())).status).toBe(403);
    expect(db.tx.series.update).not.toHaveBeenCalled();
  });
  it("rejects signed-out requests", async () => {
    auth.getServerSession.mockResolvedValue(null);
    expect((await PATCH(request({ heroImageUrlEs: "/es.jpg" }), context())).status).toBe(403);
  });
  it("writes only requested locale fields, leaving status, URLs and legacy artwork unchanged", async () => {
    expect((await PATCH(request({ heroImageUrlEs: "/es.jpg", heroImageUrlPt: "" }), context())).status).toBe(200);
    expect(db.tx.series.update).toHaveBeenCalledWith({ where: { id: "series-1" }, data: { heroImageUrlEs: "/es.jpg", heroImageUrlPt: null } });
    expect(db.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "EXPERIENCE_UPDATED", metadata: { seriesId: "series-1", fields: ["heroImageUrlEs", "heroImageUrlPt"] } }) });
  });
  it("preserves other admins' existing non-artwork edit permissions", async () => {
    auth.getServerSession.mockResolvedValue({ user: { id: "other-1", roles: ["FB_DIRECTOR"] } });
    expect((await PATCH(request({ title: "Existing behavior" }), context())).status).toBe(200);
  });
  it("rejects unsafe URLs before database operations", async () => {
    expect((await PATCH(request({ heroImageUrlEs: "javascript:alert(1)" }), context())).status).toBe(400);
    expect(db.prisma.series.findUnique).not.toHaveBeenCalled();
    expect(db.tx.series.update).not.toHaveBeenCalled();
  });
});
