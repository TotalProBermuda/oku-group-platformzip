import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { detectAuditAnomalies } from "@/server/audit/anomalyDetector";

type Row = {
  id: string;
  action?: string;
  actorId?: string | null;
  ip?: string | null;
  metadata?: unknown;
  createdAt: Date;
};

const NOW = new Date("2026-05-16T12:00:00.000Z");

// Stub findMany to dispatch by `action` filter so each detector pulls
// only its own rows. The detector composes findMany() calls in order
// (A→F); we route based on the where.action shape.
function installRows(rowsByAction: Record<string, Row[]>) {
  vi.mocked(prisma.auditLog.findMany).mockImplementation(
    async (args: unknown) => {
      const where = (args as { where: { action?: unknown } }).where;
      const action = where?.action;
      let key: string | null = null;
      if (typeof action === "string") {
        key = action;
      } else if (
        action &&
        typeof action === "object" &&
        "in" in action &&
        Array.isArray((action as { in: unknown[] }).in)
      ) {
        // Use the first member of the IN list as the bucket key.
        key = String((action as { in: string[] }).in[0]);
      }
      const rows = (key && rowsByAction[key]) || [];
      // Mimic Prisma's projection well enough for the detector.
      return rows as never;
    },
  );
}

beforeEach(() => {
  vi.mocked(prisma.auditLog.findMany).mockReset();
});

describe("detectAuditAnomalies", () => {
  it("A: fires when authnet test failures cross threshold within 1h", async () => {
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: `a-${i}`,
      action: "payment.gateway.authnet.test.failed",
      actorId: i % 2 === 0 ? "u_alice" : "u_bob",
      createdAt: new Date(NOW.getTime() - i * 60_000),
    }));
    installRows({ "payment.gateway.authnet.test.failed": rows });
    const out = await detectAuditAnomalies({ now: NOW });
    const a = out.find((s) => s.pattern === "A");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("warn");
    expect(a!.sourceAuditIds.length).toBe(5);
    expect(a!.details.provider).toBe("authnet");
    expect(a!.details.distinctActors).toBe(2);
  });

  it("A: stays silent below threshold", async () => {
    installRows({
      "payment.gateway.authnet.test.failed": [
        { id: "a-1", action: "payment.gateway.authnet.test.failed", actorId: "u", createdAt: NOW },
      ],
    });
    const out = await detectAuditAnomalies({ now: NOW });
    expect(out.find((s) => s.pattern === "A")).toBeUndefined();
  });

  it("B: fires when rejected change is followed by a different actor's success", async () => {
    installRows({
      "payment.gateway.active.changed": [
        {
          id: "b-rej",
          action: "payment.gateway.active.changed.rejected",
          actorId: "u_alice",
          createdAt: new Date(NOW.getTime() - 60_000),
        },
        {
          id: "b-ok",
          action: "payment.gateway.active.changed",
          actorId: "u_bob",
          createdAt: NOW,
        },
      ],
    });
    const out = await detectAuditAnomalies({ now: NOW });
    const b = out.find((s) => s.pattern === "B");
    expect(b).toBeDefined();
    expect(b!.severity).toBe("critical");
    expect(b!.sourceAuditIds).toEqual(["b-rej", "b-ok"]);
  });

  it("B: stays silent when the same actor retries successfully", async () => {
    installRows({
      "payment.gateway.active.changed": [
        {
          id: "b-rej",
          action: "payment.gateway.active.changed.rejected",
          actorId: "u_alice",
          createdAt: new Date(NOW.getTime() - 60_000),
        },
        {
          id: "b-ok",
          action: "payment.gateway.active.changed",
          actorId: "u_alice",
          createdAt: NOW,
        },
      ],
    });
    const out = await detectAuditAnomalies({ now: NOW });
    expect(out.find((s) => s.pattern === "B")).toBeUndefined();
  });

  it("C: fires when one actor REJECTs > threshold distinct beneficiaries", async () => {
    const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({
      id: `c-${i}`,
      actorId: "u_rogue",
      metadata: { after: "REJECTED", targetUserId: `b-${i}` },
      createdAt: new Date(NOW.getTime() - i * 60_000),
    }));
    installRows({ "beneficiary.status.transition": rows });
    const out = await detectAuditAnomalies({ now: NOW });
    const c = out.find((s) => s.pattern === "C");
    expect(c).toBeDefined();
    expect(c!.severity).toBe("critical");
    expect(c!.details.actorId).toBe("u_rogue");
    expect(c!.details.distinctBeneficiaries).toBe(6);
  });

  it("C: ignores transitions to non-REJECTED/ON_HOLD states", async () => {
    const rows: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: `c-${i}`,
      actorId: "u_rogue",
      metadata: { after: "BANK_READY", targetUserId: `b-${i}` },
      createdAt: NOW,
    }));
    installRows({ "beneficiary.status.transition": rows });
    const out = await detectAuditAnomalies({ now: NOW });
    expect(out.find((s) => s.pattern === "C")).toBeUndefined();
  });

  it("D: fires for ticket exports above the row-count threshold", async () => {
    installRows({
      "admin.tickets.export": [
        {
          id: "d-big",
          actorId: "u_export",
          metadata: { rowCount: 5000 },
          createdAt: NOW,
        },
        {
          id: "d-small",
          actorId: "u_export",
          metadata: { rowCount: 10 },
          createdAt: NOW,
        },
      ],
    });
    const out = await detectAuditAnomalies({ now: NOW });
    const d = out.filter((s) => s.pattern === "D");
    expect(d.length).toBe(1);
    expect(d[0].sourceAuditIds).toEqual(["d-big"]);
    expect(d[0].details.rowCount).toBe(5000);
  });

  it("E: fires whenever beneficiary search returns bank-field values", async () => {
    installRows({
      "admin.beneficiary.search": [
        {
          id: "e-1",
          actorId: "u_search",
          metadata: { matchedBankField: true },
          createdAt: NOW,
        },
        {
          id: "e-2",
          actorId: "u_search",
          metadata: { matchedBankField: false },
          createdAt: NOW,
        },
      ],
    });
    const out = await detectAuditAnomalies({ now: NOW });
    const e = out.filter((s) => s.pattern === "E");
    expect(e.length).toBe(1);
    expect(e[0].severity).toBe("critical");
    expect(e[0].sourceAuditIds).toEqual(["e-1"]);
  });

  it("F: fires per-IP and globally on admin-denial clusters", async () => {
    const ipRows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      id: `f-ip-${i}`,
      ip: "10.0.0.99",
      createdAt: NOW,
    }));
    const otherRows: Row[] = Array.from({ length: 20 }, (_, i) => ({
      id: `f-other-${i}`,
      ip: `10.0.${i}.1`,
      createdAt: NOW,
    }));
    installRows({ "auth.admin.denied": [...ipRows, ...otherRows] });
    const out = await detectAuditAnomalies({ now: NOW });
    const fSignals = out.filter((s) => s.pattern === "F");
    expect(fSignals.length).toBeGreaterThanOrEqual(2);
    expect(fSignals.some((s) => s.signalKey.startsWith("F:ip:10.0.0.99:"))).toBe(true);
    expect(fSignals.some((s) => s.signalKey.startsWith("F:global:"))).toBe(true);
  });

  it("returns nothing when the audit log is empty", async () => {
    installRows({});
    const out = await detectAuditAnomalies({ now: NOW });
    expect(out).toEqual([]);
  });
});
