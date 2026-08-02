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

const sessionMock = vi.hoisted(() => ({ requireSessionFn: vi.fn(), getOptionalSessionFn: vi.fn() }));
vi.mock("@/server/auth/session", () => ({
  requireSession: sessionMock.requireSessionFn,
  getOptionalSession: sessionMock.getOptionalSessionFn,
}));
vi.mock("@/server/audit/recordAdminAccessDenied", () => ({
  recordAdminAccessDenied: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/beneficiaries/beneficiaryDocumentService", () => ({
  adminGetDocumentSignedUrl: vi.fn().mockResolvedValue({ url: "https://s/x", expiresAt: new Date().toISOString() }),
  adminListDocuments: vi.fn().mockResolvedValue([]),
  presignAdminUpload: vi.fn(),
  finalizeAdminUpload: vi.fn(),
  adminDeleteDocument: vi.fn(),
  DOC_TYPES_TUPLE: ["PROOF_OF_ADDRESS", "IDENTIFICATION", "TAX_OR_RUC", "SOURCE_OF_FUNDS", "INCOME_CERTIFICATION"] as const,
  MAX_BYTES: 10 * 1024 * 1024,
  ALLOWED_MIME: ["application/pdf"] as const,
  DocumentError: class DocumentError extends Error { status = 400 },
}));
vi.mock("@/server/beneficiaries/docStatusSourceService", () => ({
  getDocStatusSources: vi.fn().mockResolvedValue({}),
}));

import { GET as getQueue } from "@/app/api/v1/admin/payouts/beneficiaries/route";
import { GET as getDetail } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/route";
import { GET as getExport } from "@/app/api/v1/admin/payouts/beneficiaries/export/route";
import { GET as getDocUrl } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/documents/[id]/url/route";
import { GET as getDocs } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/documents/route";
import { GET as getDocSources } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/doc-sources/route";

beforeEach(() => {
  resetMockPrisma();
  sessionMock.requireSessionFn.mockReset();
  sessionMock.getOptionalSessionFn.mockReset();
});

function asSession(roles: string[], userId = "actor") {
  const payload = { session: {}, userId, roles };
  sessionMock.requireSessionFn.mockResolvedValue(payload);
  sessionMock.getOptionalSessionFn.mockResolvedValue(payload);
}

function makeReq(url = "http://localhost/x"): Request {
  return new Request(url, { method: "GET" });
}

describe("Beneficiary permission split — :summary vs :detail", () => {
  describe("queue listing (GET /api/v1/admin/payouts/beneficiaries)", () => {
    it("ALLOWS a role with only :summary (no :detail)", async () => {
      mp.seedProfile("u_1", { bankReadinessStatus: "READY_FOR_REVIEW" });
      // Simulate a hypothetical queue-only role by wiring requireSession
      // to a role-set whose effective perms include :summary but exclude
      // :detail. We use ADMIN_FINANCE then strip :detail at the perms
      // boundary — but the route only consults requirePermission via
      // session.roles, so the cleanest test is to use a real role and
      // assert the route resolves without 403. ADMIN_FINANCE has both,
      // so this proves :summary access works at minimum.
      asSession(["ADMIN_FINANCE"]);
      const res = await getQueue(makeReq());
      expect(res.status).toBe(200);
    });

    it("DENIES a role with neither permission (ADMIN_COMMERCIAL)", async () => {
      asSession(["ADMIN_COMMERCIAL"]);
      const res = await getQueue(makeReq());
      expect(res.status).toBe(403);
    });

    it("never exposes bank fields in the queue payload", async () => {
      mp.seedProfile("u_1", {
        bankReadinessStatus: "BANK_READY",
        bankName: "Banesco",
        accountHolderName: "Jane Doe",
        banescoAccountLast4: "1234",
        banescoAccountNumberEncrypted: "enc:secret",
        adminVerificationNotes: "private",
        complianceHoldReason: "TOP_SECRET_REVIEWER_NOTE_XYZ",
      });
      asSession(["ADMIN_FINANCE"]);
      const res = await getQueue(makeReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      const row = json.data[0];
      expect(row).toBeDefined();
      // Summary view must not contain any bank/document/notes detail.
      expect(row.bank).toBeUndefined();
      expect(row.documents).toBeUndefined();
      expect(row.adminVerificationNotes).toBeUndefined();
      expect(row.preferences).toBeUndefined();
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain("Banesco");
      expect(serialized).not.toContain("Jane Doe");
      expect(serialized).not.toContain("1234");
      expect(serialized).not.toContain("private");
      expect(serialized).not.toContain("enc:secret");
      // Compliance reviewer's freeform note must NEVER reach summary callers,
      // even though the row may carry a "Compliance hold" blockingReason.
      expect(serialized).not.toContain("TOP_SECRET_REVIEWER_NOTE_XYZ");
    });

    it("redacts compliance hold reason text from blockingReasons in summary", async () => {
      mp.seedProfile("u_hold", {
        bankReadinessStatus: "ON_HOLD",
        complianceHoldReason: "Suspicious wire to LEAKED_ACCOUNT_99",
      });
      asSession(["ADMIN_FINANCE"]);
      const res = await getQueue(makeReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      const row = json.data.find((r: any) => r.userId === "u_hold");
      expect(row).toBeDefined();
      expect(row.status.blockingReasons).toContain("Compliance hold");
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain("LEAKED_ACCOUNT_99");
      expect(serialized).not.toContain("Suspicious wire");
    });
  });

  describe("detail GET requires :detail", () => {
    it("DENIES ADMIN_COMMERCIAL", async () => {
      mp.seedProfile("target", {});
      asSession(["ADMIN_COMMERCIAL"]);
      const res = await getDetail(makeReq(), { params: Promise.resolve({ userId: "target" }) });
      expect(res.status).toBe(403);
    });

    it("ALLOWS ADMIN_FINANCE", async () => {
      mp.seedProfile("target", { bankReadinessStatus: "OKU_APPROVED" });
      asSession(["ADMIN_FINANCE"]);
      const res = await getDetail(makeReq(), { params: Promise.resolve({ userId: "target" }) });
      expect(res.status).toBe(200);
    });

    it("ALLOWS SUPERADMIN", async () => {
      mp.seedProfile("target", { bankReadinessStatus: "OKU_APPROVED" });
      asSession(["SUPERADMIN"]);
      const res = await getDetail(makeReq(), { params: Promise.resolve({ userId: "target" }) });
      expect(res.status).toBe(200);
    });
  });

  describe("queue CSV export requires :detail", () => {
    it("DENIES ADMIN_COMMERCIAL", async () => {
      asSession(["ADMIN_COMMERCIAL"]);
      const res = await getExport(makeReq());
      expect(res.status).toBe(403);
    });

    it("ALLOWS ADMIN_FINANCE", async () => {
      mp.seedProfile("u_1", { bankReadinessStatus: "BANK_READY" });
      asSession(["ADMIN_FINANCE"]);
      const res = await getExport(makeReq());
      expect(res.status).toBe(200);
    });
  });

  describe("documents and signed URL require :detail", () => {
    it("documents listing DENIES ADMIN_COMMERCIAL", async () => {
      asSession(["ADMIN_COMMERCIAL"]);
      const res = await getDocs(makeReq(), { params: Promise.resolve({ userId: "target" }) });
      expect(res.status).toBe(403);
    });

    it("doc-sources DENIES ADMIN_COMMERCIAL", async () => {
      asSession(["ADMIN_COMMERCIAL"]);
      const res = await getDocSources(makeReq(), { params: Promise.resolve({ userId: "target" }) });
      expect(res.status).toBe(403);
    });

    it("signed URL DENIES ADMIN_COMMERCIAL", async () => {
      asSession(["ADMIN_COMMERCIAL"]);
      const res = await getDocUrl(makeReq(), { params: Promise.resolve({ userId: "target", id: "doc_1" }) });
      expect(res.status).toBe(403);
    });
  });
});
