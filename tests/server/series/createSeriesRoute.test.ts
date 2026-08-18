import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireSession: sessionMock.requireSession }));

const dbMock = vi.hoisted(() => {
  const tx = {
    series: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      venue: { findUnique: vi.fn() },
      restaurantSpace: { findFirst: vi.fn() },
      series: { findUnique: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: dbMock.prisma }));

import { POST } from "@/app/api/v1/admin/series/route";

const validBody = {
  slug: "terrace-dinners",
  title: "Terrace Dinners",
  hostType: "OKU",
  venueId: "venue-1",
  spaceId: "space-1",
};

function request(body: unknown) {
  return new Request("http://localhost/api/v1/admin/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.requireSession.mockResolvedValue({ userId: "fb-director-1", roles: ["FB_DIRECTOR"] });
  dbMock.prisma.venue.findUnique.mockResolvedValue({ id: "venue-1" });
  dbMock.prisma.restaurantSpace.findFirst.mockResolvedValue({ conceptKey: "TERRACE" });
  dbMock.prisma.series.findUnique.mockResolvedValue(null);
  dbMock.tx.series.create.mockResolvedValue({ id: "series-1", ...validBody, status: "DRAFT" });
  dbMock.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
});

describe("POST /api/v1/admin/series", () => {
  it("creates a draft with an operational venue and records the action", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { id: "series-1" } });
    expect(dbMock.tx.series.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ venueId: "venue-1", spaceId: "space-1", status: "DRAFT" }),
    });
    expect(dbMock.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: "fb-director-1", action: "EXPERIENCE_CREATED" }),
    });
  });

  it("rejects a space belonging to another venue", async () => {
    dbMock.prisma.restaurantSpace.findFirst.mockResolvedValue(null);
    const response = await POST(request(validBody));
    expect(response.status).toBe(400);
    expect(dbMock.tx.series.create).not.toHaveBeenCalled();
  });

  it("returns validation details instead of failing silently", async () => {
    const response = await POST(request({ ...validBody, slug: "not a slug" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, fields: { slug: expect.any(Array) } });
    expect(dbMock.prisma.venue.findUnique).not.toHaveBeenCalled();
  });

  it("returns a conflict for a duplicate slug", async () => {
    dbMock.prisma.series.findUnique.mockResolvedValue({ id: "existing" });
    const response = await POST(request(validBody));
    expect(response.status).toBe(409);
    expect(dbMock.tx.series.create).not.toHaveBeenCalled();
  });
});
