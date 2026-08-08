import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  listSecurityAlerts,
  summarizeAlerts,
} from "@/server/security/listSecurityAlerts";

beforeEach(() => {
  vi.mocked(prisma.auditLog.findMany).mockReset();
});

describe("listSecurityAlerts", () => {
  it("normalizes audit rows into typed SecurityAlertRow shape", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: "a1",
        createdAt: new Date("2026-05-16T11:00:00.000Z"),
        metadata: {
          signalKey: "E:abc",
          pattern: "E",
          severity: "critical",
          summary: "Bank field leak",
          sourceAuditIds: ["row-1", "row-2"],
          details: { actorId: "u_x" },
          windowStart: "2026-05-15T11:00:00.000Z",
          windowEnd: "2026-05-16T11:00:00.000Z",
        },
      },
    ] as never);

    const rows = await listSecurityAlerts();
    expect(rows).toEqual([
      {
        id: "a1",
        signalKey: "E:abc",
        pattern: "E",
        severity: "critical",
        summary: "Bank field leak",
        sourceAuditIds: ["row-1", "row-2"],
        details: { actorId: "u_x" },
        windowStart: "2026-05-15T11:00:00.000Z",
        windowEnd: "2026-05-16T11:00:00.000Z",
        firedAt: "2026-05-16T11:00:00.000Z",
      },
    ]);
  });

  it("filters by severity and pattern in-memory after fetch", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: "a1",
        createdAt: new Date("2026-05-16T11:00:00.000Z"),
        metadata: { pattern: "E", severity: "critical", signalKey: "E:1", summary: "" },
      },
      {
        id: "a2",
        createdAt: new Date("2026-05-16T10:00:00.000Z"),
        metadata: { pattern: "A", severity: "warn", signalKey: "A:1", summary: "" },
      },
    ] as never);

    const critOnly = await listSecurityAlerts({ severity: "critical" });
    expect(critOnly.map((r) => r.id)).toEqual(["a1"]);

    const aOnly = await listSecurityAlerts({ pattern: "A" });
    expect(aOnly.map((r) => r.id)).toEqual(["a2"]);
  });

  it("tolerates malformed metadata without throwing", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      { id: "x", createdAt: new Date(), metadata: null },
      { id: "y", createdAt: new Date(), metadata: { sourceAuditIds: "not-an-array" } },
      { id: "z", createdAt: new Date(), metadata: { details: ["unexpected", "array"] } },
    ] as never);
    const rows = await listSecurityAlerts();
    expect(rows.length).toBe(3);
    expect(rows[0].pattern).toBe("?");
    expect(rows[1].sourceAuditIds).toEqual([]);
    expect(rows[2].details).toEqual({});
  });

  it("caps the limit at the documented maximum", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);
    await listSecurityAlerts({ limit: 99999 });
    const arg = vi.mocked(prisma.auditLog.findMany).mock.calls[0][0] as { take: number };
    expect(arg.take).toBeLessThanOrEqual(500);
  });
});

describe("summarizeAlerts", () => {
  it("counts by severity and pattern", () => {
    const out = summarizeAlerts([
      { id: "1", signalKey: "", pattern: "E", severity: "critical", summary: "", sourceAuditIds: [], details: {}, windowStart: null, windowEnd: null, firedAt: "" },
      { id: "2", signalKey: "", pattern: "A", severity: "warn", summary: "", sourceAuditIds: [], details: {}, windowStart: null, windowEnd: null, firedAt: "" },
      { id: "3", signalKey: "", pattern: "A", severity: "warn", summary: "", sourceAuditIds: [], details: {}, windowStart: null, windowEnd: null, firedAt: "" },
    ]);
    expect(out.total).toBe(3);
    expect(out.bySeverity.critical).toBe(1);
    expect(out.bySeverity.warn).toBe(2);
    expect(out.byPattern.A).toBe(2);
    expect(out.byPattern.E).toBe(1);
  });
});
