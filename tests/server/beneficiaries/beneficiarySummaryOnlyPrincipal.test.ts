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

// Synthetic principal with ONLY `admin:beneficiaries:summary` (no
// :detail, no :write). No production role currently has this exact
// permission set, but the route layer must respect it — that is the
// whole point of splitting the permission. We mock the permissions
// module so `hasPermission` answers truthfully for this synthetic role.
const SUMMARY_ONLY_ROLE = "TEST_SUMMARY_ONLY";
const SUMMARY_ONLY_PERMS = new Set<string>([
  "public:read",
  "account:read",
  "admin:beneficiaries:summary",
]);
vi.mock("@/lib/permissions", () => ({
  hasPermission: (roles: string[], perm: string) => {
    if (roles.includes(SUMMARY_ONLY_ROLE)) return SUMMARY_ONLY_PERMS.has(perm);
    return false;
  },
  requirePermission: (roles: string[], perm: string) => {
    const ok = roles.includes(SUMMARY_ONLY_ROLE) && SUMMARY_ONLY_PERMS.has(perm);
    if (!ok) {
      const err = new Error("Forbidden") as Error & { status: number };
      err.status = 403;
      throw err;
    }
  },
  ROLE_PERMISSIONS: {},
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
  adminGetDocumentSignedUrl: vi.fn(),
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
import { GET as getDocs } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/documents/route";
import { GET as getDocSources } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/doc-sources/route";
import { GET as getDocUrl } from "@/app/api/v1/admin/payouts/beneficiaries/[userId]/documents/[id]/url/route";

beforeEach(() => {
  resetMockPrisma();
  sessionMock.requireSessionFn.mockReset();
  sessionMock.getOptionalSessionFn.mockReset();
  const payload = { session: {}, userId: "summary_only_actor", roles: [SUMMARY_ONLY_ROLE] };
  sessionMock.requireSessionFn.mockResolvedValue(payload);
  sessionMock.getOptionalSessionFn.mockResolvedValue(payload);
});

function makeReq(url = "http://localhost/x"): Request {
  return new Request(url, { method: "GET" });
}

describe("Summary-only principal — queue allowed, detail denied", () => {
  it("CAN list the queue (200)", async () => {
    mp.seedProfile("u_1", { bankReadinessStatus: "READY_FOR_REVIEW" });
    const res = await getQueue(makeReq());
    expect(res.status).toBe(200);
  });

  it("CANNOT fetch full detail (403)", async () => {
    mp.seedProfile("target", { bankReadinessStatus: "OKU_APPROVED" });
    const res = await getDetail(makeReq(), { params: Promise.resolve({ userId: "target" }) });
    expect(res.status).toBe(403);
  });

  it("CANNOT fetch documents (403)", async () => {
    const res = await getDocs(makeReq(), { params: Promise.resolve({ userId: "target" }) });
    expect(res.status).toBe(403);
  });

  it("CANNOT fetch doc-sources (403)", async () => {
    const res = await getDocSources(makeReq(), { params: Promise.resolve({ userId: "target" }) });
    expect(res.status).toBe(403);
  });

  it("CANNOT fetch a signed document URL (403)", async () => {
    const res = await getDocUrl(makeReq(), { params: Promise.resolve({ userId: "target", id: "doc_1" }) });
    expect(res.status).toBe(403);
  });

  it("CANNOT export the queue CSV (403)", async () => {
    const res = await getExport(makeReq());
    expect(res.status).toBe(403);
  });
});
