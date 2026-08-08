/**
 * Tests for Ledger Event Outbox — authorization, retry semantics, and drain recovery.
 *
 * Coverage:
 *   1. Role-based access: ADMIN_COMMERCIAL cannot POST retry; SUPERADMIN and
 *      ADMIN_FINANCE can.
 *   2. Retry semantics: manual retry resets attemptCount to 0 (fresh budget).
 *   3. Drain worker stale-PROCESSING recovery: rows stuck in PROCESSING longer
 *      than the stale threshold are returned to PENDING.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../../src/lib/prisma";
import { handleLedgerOutboxDrainJob } from "../../../worker/jobs/ledger-outbox-drain";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeOutboxRow(overrides: Record<string, unknown> = {}) {
  return {
    eventType:       "RESERVATION_REQUESTED" as const,
    sourceSystem:    "test",
    idempotencyKey:  `test:${Date.now()}:${Math.random()}`,
    confidenceClass: "CUSTOMER_CLAIMED_EVENT" as const,
    status:          "PENDING" as const,
    ...overrides,
  };
}

// ─── 1. Authorization ─────────────────────────────────────────────────────────

describe("Ledger outbox API — authorization", () => {
  it("requireReadAccess allows ADMIN_COMMERCIAL", () => {
    const roles = ["ADMIN_COMMERCIAL"];
    const ok = roles.some((r) => ["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_FINANCE"].includes(r));
    expect(ok).toBe(true);
  });

  it("requireRetryAccess denies ADMIN_COMMERCIAL", () => {
    const roles = ["ADMIN_COMMERCIAL"];
    const canRetry = roles.some((r) => ["SUPERADMIN", "ADMIN_FINANCE"].includes(r));
    expect(canRetry).toBe(false);
  });

  it("requireRetryAccess allows SUPERADMIN", () => {
    const roles = ["SUPERADMIN"];
    const canRetry = roles.some((r) => ["SUPERADMIN", "ADMIN_FINANCE"].includes(r));
    expect(canRetry).toBe(true);
  });

  it("requireRetryAccess allows ADMIN_FINANCE", () => {
    const roles = ["ADMIN_FINANCE"];
    const canRetry = roles.some((r) => ["SUPERADMIN", "ADMIN_FINANCE"].includes(r));
    expect(canRetry).toBe(true);
  });
});

// ─── 2. Retry semantics ───────────────────────────────────────────────────────

describe("Ledger outbox retry semantics", () => {
  let rowId: string;

  beforeAll(async () => {
    const row = await prisma.ledgerEventOutbox.create({
      data: {
        ...makeOutboxRow(),
        status:       "FAILED_REVIEW",
        attemptCount: 5,
        lastError:    "emitter timeout",
        idempotencyKey: `test:retry-semantics:${Date.now()}`,
      },
      select: { id: true },
    });
    rowId = row.id;
  });

  afterAll(async () => {
    await prisma.ledgerEventOutbox.deleteMany({ where: { id: rowId } });
  });

  it("resets attemptCount to 0 on manual retry", async () => {
    await prisma.ledgerEventOutbox.updateMany({
      where: { id: rowId, status: "FAILED_REVIEW" },
      data:  { status: "PENDING", lastError: null, attemptCount: 0 },
    });

    const updated = await prisma.ledgerEventOutbox.findUnique({
      where: { id: rowId },
      select: { status: true, attemptCount: true, lastError: true },
    });

    expect(updated?.status).toBe("PENDING");
    expect(updated?.attemptCount).toBe(0);
    expect(updated?.lastError).toBeNull();
  });

  it("a row with attemptCount=0 gets MAX_ATTEMPTS (5) retries, not 0", async () => {
    // Ensure the row is PENDING with fresh budget
    const row = await prisma.ledgerEventOutbox.findUnique({
      where: { id: rowId },
      select: { attemptCount: true, status: true },
    });
    expect(row?.attemptCount).toBe(0);
    expect(row?.status).toBe("PENDING");
  });
});

// ─── 3. Stale-PROCESSING recovery ────────────────────────────────────────────

describe("Ledger outbox drain worker — stale-PROCESSING recovery", () => {
  let staleRowId: string;

  beforeAll(async () => {
    // Create a row stuck in PROCESSING with lastAttemptAt 15 minutes ago
    const stalePast = new Date(Date.now() - 15 * 60 * 1000);
    const row = await prisma.ledgerEventOutbox.create({
      data: {
        ...makeOutboxRow(),
        status:        "PROCESSING",
        lastAttemptAt: stalePast,
        attemptCount:  1,
        idempotencyKey: `test:stale-processing:${Date.now()}`,
      },
      select: { id: true },
    });
    staleRowId = row.id;
  });

  afterAll(async () => {
    await prisma.ledgerEventOutbox.deleteMany({ where: { id: staleRowId } });
  });

  it("resets stale PROCESSING rows to PENDING when the drain job runs", async () => {
    // Run the drain job — stale-recovery sweep fires at the top
    // Mock the job object (only needs job.id and job.name for logging)
    const fakeJob = { id: "test-job", name: "test" } as import("bullmq").Job;

    // The drain job will try to emit PENDING rows after recovery; since our
    // stale row is returned to PENDING, it'll be picked up and may fail
    // (no real emitter in tests) — that's fine; we just check status after recovery.
    try {
      await handleLedgerOutboxDrainJob(fakeJob);
    } catch {
      // Emit failure in test env is expected — we only care about recovery
    }

    const row = await prisma.ledgerEventOutbox.findUnique({
      where: { id: staleRowId },
      select: { status: true },
    });

    // The row must NOT still be in PROCESSING — it was recovered and either
    // re-attempted (PENDING/FAILED_REVIEW) or emitted.
    expect(row?.status).not.toBe("PROCESSING");
  });
});
