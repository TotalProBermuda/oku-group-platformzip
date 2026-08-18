import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionMock = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireSession: sessionMock.requireSession }));

const lifecycleMock = vi.hoisted(() => ({ assertSeriesReadyForPublication: vi.fn(), syncSeriesOccupanciesForStatus: vi.fn() }));
vi.mock("@/server/series/publicationLifecycle", () => ({
  assertSeriesReadyForPublication: lifecycleMock.assertSeriesReadyForPublication,
  syncSeriesOccupanciesForStatus: lifecycleMock.syncSeriesOccupanciesForStatus,
  SeriesPublicationError: class SeriesPublicationError extends Error {},
}));

const dbMock = vi.hoisted(() => {
  const tx = { series: { update: vi.fn() }, auditLog: { create: vi.fn() } };
  return { tx, prisma: { $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) } };
});
vi.mock("@/lib/prisma", () => ({ prisma: dbMock.prisma }));

import { POST as publish } from "@/app/api/v1/admin/series/[id]/publish/route";
import { POST as unpublish } from "@/app/api/v1/admin/series/[id]/unpublish/route";

const request = new NextRequest("http://localhost/api/v1/admin/series/series-1/action", { method: "POST" });
const context = { params: Promise.resolve({ id: "series-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.requireSession.mockResolvedValue({ userId: "admin-1", roles: ["FB_DIRECTOR"] });
  dbMock.tx.series.update.mockImplementation(({ data }: { data: { status: string } }) => Promise.resolve({ id: "series-1", status: data.status }));
  dbMock.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
});

describe("series publication routes", () => {
  it("checks readiness and activates occupancy in the publish transaction", async () => {
    const response = await publish(request, context);
    expect(response.status).toBe(200);
    expect(lifecycleMock.assertSeriesReadyForPublication).toHaveBeenCalledWith(dbMock.tx, "series-1");
    expect(lifecycleMock.syncSeriesOccupanciesForStatus).toHaveBeenCalledWith(dbMock.tx, "series-1", "PUBLISHED");
    expect(dbMock.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "EXPERIENCE_PUBLISHED" }) });
  });

  it("pauses occupancy in the unpublish transaction", async () => {
    const response = await unpublish(request, context);
    expect(response.status).toBe(200);
    expect(lifecycleMock.syncSeriesOccupanciesForStatus).toHaveBeenCalledWith(dbMock.tx, "series-1", "DRAFT");
    expect(dbMock.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "EXPERIENCE_UNPUBLISHED" }) });
  });
});
