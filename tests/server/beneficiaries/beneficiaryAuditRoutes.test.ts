import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockPrisma as mp, resetMockPrisma } from "../../helpers/mockPrisma";

vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("../../helpers/mockPrisma")).mockPrisma.client,
}));
vi.mock("@/server/beneficiaries/statusEmail", () => ({
  sendBeneficiaryStatusEmail: vi.fn().mockResolvedValue(undefined),
  resolvePreferredLocale: () => "en",
}));
vi.mock("@/server/security/encryption", () => ({
  isEncryptionAvailable: () => true,
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ""),
  maskSecret: (s: string) => ({ last4: s.slice(-4) }),
}));

// Session + RBAC are mocked per-test below.
const sessionMock = vi.hoisted(() => ({ requireSessionFn: vi.fn() }));
vi.mock("@/server/auth/session", () => ({
  requireSession: sessionMock.requireSessionFn,
}));

vi.mock("@/server/beneficiaries/beneficiaryDocumentService", () => ({
  adminGetDocumentSignedUrl: vi.fn().mockResolvedValue({ url: "https://signed.example/doc", expiresAt: new Date().toISOString() }),
  DocumentError: class DocumentError extends Error { status = 400 },
}));

import { GET as getDetail } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/route";
import { GET as getExport } from "@/app/api/v1/admin/payouts/beneficiaries/export/route";
import { GET as getDocUrl } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/documents/[id]/url/route";

beforeEach(() => {
  resetMockPrisma();
  sessionMock.requireSessionFn.mockReset();
});

function makeReq(url = "http://localhost/api/v1/admin/payouts/beneficiaries/export"): Request {
  return new Request(url, { method: "GET" });
}

describe("audit rows on beneficiary detail GET", () => {
  it("writes admin.beneficiary.detail.viewed on success", async () => {
    mp.seedProfile("target_user", { bankReadinessStatus: "OKU_APPROVED" });
    sessionMock.requireSessionFn.mockResolvedValue({
      session: {},
      userId: "actor_finance",
      roles: ["ADMIN_FINANCE"],
    });
    const res = await getDetail(makeReq(), { params: Promise.resolve({ userId: "target_user" }) });
    expect(res.status).toBe(200);
    const actions = mp.store.auditLogs.map(a => a.action);
    expect(actions).toContain("admin.beneficiary.detail.viewed");
    const row = mp.store.auditLogs.find(a => a.action === "admin.beneficiary.detail.viewed");
    expect(row?.actorId).toBe("actor_finance");
    expect((row?.metadata as { targetUserId: string }).targetUserId).toBe("target_user");
  });

  it("writes admin.beneficiary.detail.access_denied when RBAC fails", async () => {
    sessionMock.requireSessionFn.mockResolvedValue({
      session: {},
      userId: "actor_no_perms",
      roles: ["INFLUENCER"], // no admin:beneficiaries:detail
    });
    const res = await getDetail(makeReq(), { params: Promise.resolve({ userId: "victim" }) });
    expect(res.status).toBe(403);
    const actions = mp.store.auditLogs.map(a => a.action);
    expect(actions).toContain("admin.beneficiary.detail.access_denied");
    expect(actions).not.toContain("admin.beneficiary.detail.viewed");
    const row = mp.store.auditLogs.find(a => a.action === "admin.beneficiary.detail.access_denied");
    const meta = row?.metadata as { targetUserId: string; permissionMissing: string };
    expect(meta.targetUserId).toBe("victim");
    expect(meta.permissionMissing).toBe("admin:beneficiaries:detail");
  });
});

describe("audit rows on beneficiary signed-document URL", () => {
  it("writes admin.beneficiary.document.access_denied when RBAC fails", async () => {
    sessionMock.requireSessionFn.mockResolvedValue({
      session: {},
      userId: "actor_no_perms",
      roles: ["INFLUENCER"],
    });
    const req = new Request("http://localhost/x", { method: "GET" });
    const res = await getDocUrl(req, {
      params: Promise.resolve({ userId: "victim", id: "doc_1" }),
    });
    expect(res.status).toBe(403);
    const actions = mp.store.auditLogs.map(a => a.action);
    expect(actions).toContain("admin.beneficiary.document.access_denied");
    expect(actions).not.toContain("admin.beneficiary.document.viewed");
    const row = mp.store.auditLogs.find(a => a.action === "admin.beneficiary.document.access_denied");
    const meta = row?.metadata as { targetUserId: string; docId: string; permissionMissing: string };
    expect(meta.targetUserId).toBe("victim");
    expect(meta.docId).toBe("doc_1");
    expect(meta.permissionMissing).toBe("admin:beneficiaries:detail");
  });

  it("invokes the signed-URL service (which records the success audit) when RBAC passes", async () => {
    sessionMock.requireSessionFn.mockResolvedValue({
      session: {},
      userId: "actor_finance",
      roles: ["ADMIN_FINANCE"],
    });
    const docService = await import("@/server/beneficiaries/beneficiaryDocumentService");
    const req = new Request("http://localhost/x", { method: "GET" });
    const res = await getDocUrl(req, {
      params: Promise.resolve({ userId: "target_user", id: "doc_1" }),
    });
    expect(res.status).toBe(200);
    expect(docService.adminGetDocumentSignedUrl).toHaveBeenCalledWith("target_user", "doc_1", "actor_finance");
    const actions = mp.store.auditLogs.map(a => a.action);
    expect(actions).not.toContain("admin.beneficiary.document.access_denied");
  });
});

describe("audit rows on beneficiary queue CSV export", () => {
  it("writes compliance.export.beneficiary_queue on success", async () => {
    mp.seedProfile("u_1", { bankReadinessStatus: "BANK_READY" });
    mp.seedProfile("u_2", { bankReadinessStatus: "READY_FOR_REVIEW" });
    sessionMock.requireSessionFn.mockResolvedValue({
      session: {},
      userId: "actor_finance",
      roles: ["ADMIN_FINANCE"],
    });
    const res = await getExport(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    // Header row exists; raw account numbers do not (column is account hint only).
    expect(csv.split("\n")[0]).toContain("accountLast4");
    const actions = mp.store.auditLogs.map(a => a.action);
    expect(actions).toContain("compliance.export.beneficiary_queue");
  });

  it("writes compliance.export.beneficiary_queue.access_denied when RBAC fails", async () => {
    sessionMock.requireSessionFn.mockResolvedValue({
      session: {},
      userId: "probe",
      roles: ["INFLUENCER"],
    });
    const res = await getExport(makeReq());
    expect(res.status).toBe(403);
    const actions = mp.store.auditLogs.map(a => a.action);
    expect(actions).toContain("compliance.export.beneficiary_queue.access_denied");
    expect(actions).not.toContain("compliance.export.beneficiary_queue");
  });
});
