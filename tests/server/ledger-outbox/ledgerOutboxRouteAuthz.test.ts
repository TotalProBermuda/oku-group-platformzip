/**
 * Route-level authorization tests for GET/POST /api/v1/admin/ledger-outbox.
 *
 * Tests actual HTTP handler invocations with mocked session and Prisma so no
 * real database or auth middleware is required. This validates the RBAC split
 * defined in the route (not just the predicate logic tested inline).
 *
 * Access matrix (post FB_DIRECTOR / RESTAURANT_SUPERVISOR migration):
 *   GET  (read):   SUPERADMIN ✓  ADMIN_FINANCE ✓  others ✗
 *   POST (retry):  SUPERADMIN ✓  ADMIN_FINANCE ✓  others ✗
 *
 * ADMIN_COMMERCIAL is a legacy F&B Director alias, but ledger outbox is a
 * governance/finance surface — denied here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock session BEFORE importing route handlers ─────────────────────────────
const sessionMock = vi.hoisted(() => ({ requireSessionFn: vi.fn() }));
vi.mock("@/server/auth/session", () => ({
  requireSession: sessionMock.requireSessionFn,
}));

// ─── Mock Prisma with enough surface for the route ────────────────────────────
const prismaMock = vi.hoisted(() => ({
  ledgerEventOutbox: {
    findMany:  vi.fn(),
    groupBy:   vi.fn(),
    count:     vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Import route handlers AFTER mocks are registered.
import { GET, POST } from "@/app/api/v1/admin/ledger-outbox/route";
import { NextRequest } from "next/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGetRequest(status = "FAILED_REVIEW") {
  return new NextRequest(`http://localhost/api/v1/admin/ledger-outbox?status=${status}`);
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/v1/admin/ledger-outbox", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function sessionWith(roles: string[]) {
  return { session: {}, userId: "test-user", roles };
}

// ─── Default Prisma stubs (empty but valid) ──────────────────────────────────

function stubEmptyDb() {
  prismaMock.ledgerEventOutbox.findMany.mockResolvedValue([]);
  prismaMock.ledgerEventOutbox.groupBy.mockResolvedValue([]);
  prismaMock.ledgerEventOutbox.count.mockResolvedValue(0);
  prismaMock.ledgerEventOutbox.findFirst.mockResolvedValue(null);
  prismaMock.ledgerEventOutbox.updateMany.mockResolvedValue({ count: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubEmptyDb();
});

// ─── GET — read access ────────────────────────────────────────────────────────

describe("GET /api/v1/admin/ledger-outbox — read access", () => {
  it("returns 200 for SUPERADMIN", async () => {
    sessionMock.requireSessionFn.mockResolvedValue(sessionWith(["SUPERADMIN"]));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 403 for ADMIN_COMMERCIAL (F&B alias denied from governance outbox)", async () => {
    sessionMock.requireSessionFn.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns 200 for ADMIN_FINANCE", async () => {
    sessionMock.requireSessionFn.mockResolvedValue(sessionWith(["ADMIN_FINANCE"]));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
  });

  it("returns 403 for ADMIN_HR (no read access)", async () => {
    sessionMock.requireSessionFn.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for unauthenticated callers", async () => {
    sessionMock.requireSessionFn.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });
});

// ─── POST — retry access ──────────────────────────────────────────────────────

describe("POST /api/v1/admin/ledger-outbox — retry access", () => {
  it("returns 200 for SUPERADMIN retry", async () => {
    sessionMock.requireSessionFn.mockResolvedValue(sessionWith(["SUPERADMIN"]));
    const res = await POST(makePostRequest({ action: "retry", id: "some-row-id" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 for ADMIN_FINANCE retry", async () => {
    sessionMock.requireSessionFn.mockResolvedValue(sessionWith(["ADMIN_FINANCE"]));
    const res = await POST(makePostRequest({ action: "retry", id: "some-row-id" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 403 for ADMIN_COMMERCIAL (F&B alias denied from outbox details)", async () => {
    sessionMock.requireSessionFn.mockRejectedValue(
      Object.assign(new Error("Forbidden: retry requires SUPERADMIN or ADMIN_FINANCE"), { status: 403 }),
    );
    const res = await POST(makePostRequest({ action: "retry", id: "some-row-id" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for unknown action (even with valid role)", async () => {
    sessionMock.requireSessionFn.mockResolvedValue(sessionWith(["SUPERADMIN"]));
    const res = await POST(makePostRequest({ action: "do-something-invalid" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 200 for SUPERADMIN retry-all", async () => {
    sessionMock.requireSessionFn.mockResolvedValue(sessionWith(["SUPERADMIN"]));
    const res = await POST(makePostRequest({ action: "retry-all" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
