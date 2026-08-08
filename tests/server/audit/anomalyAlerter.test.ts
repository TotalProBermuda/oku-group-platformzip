import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/server/errorReporting", () => ({
  captureMessage: vi.fn(),
}));

vi.mock("@/server/audit/anomalyDetector", () => ({
  detectAuditAnomalies: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { captureMessage } from "@/server/errorReporting";
import { detectAuditAnomalies } from "@/server/audit/anomalyDetector";
import { runAuditAnomalyScan } from "@/server/audit/anomalyAlerter";

const sigE = {
  signalKey: "E:abc",
  pattern: "E" as const,
  severity: "critical" as const,
  summary: "Beneficiary search returned bank-field values.",
  sourceAuditIds: ["row-1"],
  details: { actorId: "u_search", at: "2026-05-16T12:00:00.000Z" },
  windowStart: "2026-05-15T12:00:00.000Z",
  windowEnd: "2026-05-16T12:00:00.000Z",
};

const sigC = {
  signalKey: "C:u_rogue:bucket",
  pattern: "C" as const,
  severity: "critical" as const,
  summary: "6 bulk REJECTs.",
  sourceAuditIds: ["row-2", "row-3"],
  details: { actorId: "u_rogue", distinctBeneficiaries: 6 },
  windowStart: "2026-05-15T12:00:00.000Z",
  windowEnd: "2026-05-16T12:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(prisma.auditLog.findFirst).mockReset();
  vi.mocked(prisma.auditLog.create).mockReset();
  vi.mocked(captureMessage).mockReset();
  vi.mocked(detectAuditAnomalies).mockReset();
});

describe("runAuditAnomalyScan", () => {
  it("pages new signals through captureMessage and writes evidence rows", async () => {
    vi.mocked(detectAuditAnomalies).mockResolvedValue([sigE, sigC]);
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "audit-x" } as never);

    const result = await runAuditAnomalyScan();

    expect(result.signalsDetected).toBe(2);
    expect(result.signalsAlerted).toBe(2);
    expect(result.signalsSuppressed).toBe(0);
    expect(result.alertedKeys).toEqual([sigE.signalKey, sigC.signalKey]);
    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);

    // First create call should carry the source audit ids and signalKey
    // — that's what makes the audit row triage-actionable.
    const firstCreateArg = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as {
      data: { action: string; metadata: { signalKey: string; sourceAuditIds: string[] } };
    };
    expect(firstCreateArg.data.action).toBe("audit.anomaly.alert");
    expect(firstCreateArg.data.metadata.signalKey).toBe(sigE.signalKey);
    expect(firstCreateArg.data.metadata.sourceAuditIds).toEqual(sigE.sourceAuditIds);
  });

  it("dedupes by signalKey when an alert was paged in the dedupe window", async () => {
    vi.mocked(detectAuditAnomalies).mockResolvedValue([sigE]);
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue({ id: "prior-alert" } as never);

    const result = await runAuditAnomalyScan();

    expect(result.signalsDetected).toBe(1);
    expect(result.signalsAlerted).toBe(0);
    expect(result.signalsSuppressed).toBe(1);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not let one evidence-row write failure abort the rest of the scan", async () => {
    vi.mocked(detectAuditAnomalies).mockResolvedValue([sigE, sigC]);
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.auditLog.create)
      .mockRejectedValueOnce(new Error("DB unavailable"))
      .mockResolvedValueOnce({ id: "audit-2" } as never);

    const result = await runAuditAnomalyScan();

    expect(result.signalsAlerted).toBe(2);
    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("queries dedupe rows scoped to action=audit.anomaly.alert and the signalKey", async () => {
    vi.mocked(detectAuditAnomalies).mockResolvedValue([sigE]);
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "x" } as never);

    await runAuditAnomalyScan();

    const arg = vi.mocked(prisma.auditLog.findFirst).mock.calls[0][0] as {
      where: {
        action: string;
        createdAt: { gte: Date };
        metadata: { path: string[]; equals: string };
      };
    };
    expect(arg.where.action).toBe("audit.anomaly.alert");
    expect(arg.where.metadata).toEqual({ path: ["signalKey"], equals: sigE.signalKey });
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
  });
});
