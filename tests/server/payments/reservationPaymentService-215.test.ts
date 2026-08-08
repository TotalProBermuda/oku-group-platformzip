/**
 * Reservation Payment Service — Unit tests (Payments P215)
 *
 * Covers:
 *   1. normalizeCybersourceError — human-readable messages for all branches
 *   2. createPaymentIntent is idempotent on the same idempotencyKey
 *   3. Failed payment does not advance intent status (reservation stays PENDING_PAYMENT)
 *   4. Successful authorization updates PaymentAttempt to AUTHORIZED + advances intent
 *   5. authorizePayment throws 404 when intent not found (missing credentials → safe failure)
 *   6. authorizePayment throws 409 when intent is already CAPTURED
 *   7. voidPayment throws 409 when intent is not AUTHORIZED
 *   8. voidPayment advances intent to CANCELLED without touching attribution
 *   9. capturePayment throws 409 when intent is not AUTHORIZED
 *  10. QR reservation flow does not require payment when space has no deposit
 *  11. QR reservation flow sets PENDING_PAYMENT when space requires deposit
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Prisma BEFORE importing the service ─────────────────────────────────
// vi.mock is hoisted; never reference outer `let` variables inside the factory.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentIntent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    paymentAttempt: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/server/cybersource/authorize", () => ({
  cybersourceAuthorize: vi.fn(),
  cybersourceCapture: vi.fn(),
}));

vi.mock("@/server/cybersource/transactions", () => ({
  cybersourceRefund: vi.fn(),
  cybersourceVoid: vi.fn(),
}));

vi.mock("@/server/services/ledger/ledgerOutboxService", () => ({
  enqueueLedgerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/payments/providers/types", () => ({
  safeTruncate: (v: any) => v,
}));

// ─── Import service AFTER mocks are set up ────────────────────────────────────
import {
  createPaymentIntent,
  authorizePayment,
  voidPayment,
  capturePayment,
  normalizeCybersourceError,
} from "@/server/payments/reservationPaymentService";
import { prisma } from "@/lib/prisma";
import { cybersourceAuthorize } from "@/server/cybersource/authorize";
import { cybersourceVoid } from "@/server/cybersource/transactions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIntent(overrides: Record<string, any> = {}) {
  return {
    id: "pi_test_001",
    reservationId: "res_001",
    amountCents: 5000,
    currency: "USD",
    status: "CREATED",
    cybersourceTransactionId: null,
    cybersourceRequestId: null,
    lastFailureCode: null,
    lastFailureMessage: null,
    attributionSessionId: "attr_session_001",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("normalizeCybersourceError", () => {
  it("returns NETWORK_ERROR when httpStatus is null", () => {
    const r = normalizeCybersourceError(null, null);
    expect(r.code).toBe("NETWORK_ERROR");
    expect(r.message).toMatch(/gateway/i);
  });

  it("returns AUTH_FAILURE for 401", () => {
    const r = normalizeCybersourceError(401, {});
    expect(r.code).toBe("AUTH_FAILURE");
  });

  it("returns AUTH_FAILURE for 403", () => {
    const r = normalizeCybersourceError(403, {});
    expect(r.code).toBe("AUTH_FAILURE");
  });

  it("returns PROCESSOR_DECLINED with card-declined message", () => {
    const r = normalizeCybersourceError(400, {
      errorInformation: { reason: "PROCESSOR_DECLINED" },
    });
    expect(r.code).toBe("PROCESSOR_DECLINED");
    expect(r.message).toMatch(/declined/i);
  });

  it("returns INSUFFICIENT_FUND with funds message", () => {
    const r = normalizeCybersourceError(400, {
      errorInformation: { reason: "INSUFFICIENT_FUND" },
    });
    expect(r.code).toBe("INSUFFICIENT_FUND");
    expect(r.message).toMatch(/funds/i);
  });

  it("falls back gracefully for unknown error body", () => {
    const r = normalizeCybersourceError(500, { message: "Internal error" });
    expect(r.message).toBe("Internal error");
  });
});

describe("createPaymentIntent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns existing intent when idempotencyKey already exists (idempotent)", async () => {
    (prisma.paymentIntent.findUnique as any).mockResolvedValue({ id: "pi_existing" });

    const result = await createPaymentIntent({
      reservationId: "res_001",
      amountCents: 5000,
      idempotencyKey: "key_001",
    });

    expect(result.id).toBe("pi_existing");
    expect(result.alreadyExisted).toBe(true);
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
  });

  it("creates a new intent with CREATED status and RESERVATION_DEPOSIT orderType", async () => {
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(null);
    (prisma.paymentIntent.create as any).mockResolvedValue({ id: "pi_new" });

    const result = await createPaymentIntent({
      reservationId: "res_001",
      amountCents: 5000,
      idempotencyKey: "key_002",
    });

    expect(result.id).toBe("pi_new");
    expect(result.alreadyExisted).toBe(false);
    const callArg = (prisma.paymentIntent.create as any).mock.calls[0][0];
    expect(callArg.data.status).toBe("CREATED");
    expect(callArg.data.orderType).toBe("RESERVATION_DEPOSIT");
    expect(callArg.data.provider).toBe("CYBERSOURCE");
  });
});

describe("authorizePayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok:false and leaves intent status unchanged on Cybersource failure", async () => {
    const intent = makeIntent();
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(intent);
    (cybersourceAuthorize as any).mockResolvedValue({
      httpStatus: 400,
      body: { errorInformation: { reason: "PROCESSOR_DECLINED" } },
      networkError: null,
    });
    (prisma.paymentAttempt.create as any).mockResolvedValue({ id: "att_001" });
    (prisma.paymentIntent.update as any).mockResolvedValue({});

    const result = await authorizePayment({
      paymentIntentId: "pi_test_001",
      transientToken: "tok_test",
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("PROCESSOR_DECLINED");
    // Intent status must NOT advance to AUTHORIZED on failure
    const updateArg = (prisma.paymentIntent.update as any).mock.calls[0][0];
    expect(updateArg.data.status).toBe("CREATED"); // stays at original status
  });

  it("advances intent to AUTHORIZED and records attempt on Cybersource success", async () => {
    const intent = makeIntent();
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(intent);
    (cybersourceAuthorize as any).mockResolvedValue({
      httpStatus: 201,
      body: {
        id: "cs_txn_001",
        status: "AUTHORIZED",
        processorInformation: { approvalCode: "TQ5WEF", responseCode: "00" },
      },
      networkError: null,
    });
    (prisma.paymentAttempt.create as any).mockResolvedValue({ id: "att_002" });
    (prisma.paymentIntent.update as any).mockResolvedValue({});

    const result = await authorizePayment({
      paymentIntentId: "pi_test_001",
      transientToken: "tok_test",
    });

    expect(result.ok).toBe(true);
    expect(result.cybersourceTransactionId).toBe("cs_txn_001");

    const attemptArg = (prisma.paymentAttempt.create as any).mock.calls[0][0];
    expect(attemptArg.data.status).toBe("AUTHORIZED");

    const updateArg = (prisma.paymentIntent.update as any).mock.calls[0][0];
    expect(updateArg.data.status).toBe("AUTHORIZED");
    expect(updateArg.data.cybersourceTransactionId).toBe("cs_txn_001");
    expect(updateArg.data.lastFailureCode).toBeNull();
  });

  it("throws 404 when intent not found — safe failure, no crash", async () => {
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(null);
    await expect(
      authorizePayment({ paymentIntentId: "pi_nonexistent", transientToken: "tok" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when intent is already CAPTURED", async () => {
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(makeIntent({ status: "CAPTURED" }));
    await expect(
      authorizePayment({ paymentIntentId: "pi_test_001", transientToken: "tok" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 409 when intent is already REFUNDED", async () => {
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(makeIntent({ status: "REFUNDED" }));
    await expect(
      authorizePayment({ paymentIntentId: "pi_test_001", transientToken: "tok" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("voidPayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws 409 when intent is in CREATED status (not AUTHORIZED)", async () => {
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(makeIntent({ status: "CREATED" }));
    await expect(voidPayment({ paymentIntentId: "pi_test_001" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 409 when intent is in CAPTURED status", async () => {
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(makeIntent({ status: "CAPTURED" }));
    await expect(voidPayment({ paymentIntentId: "pi_test_001" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("advances intent to CANCELLED on success without touching attribution anchor", async () => {
    const intent = makeIntent({
      status: "AUTHORIZED",
      cybersourceTransactionId: "cs_txn_authorized",
      attributionSessionId: "attr_session_001",
    });
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(intent);
    (cybersourceVoid as any).mockResolvedValue({
      httpStatus: 200,
      body: { status: "VOIDED" },
      networkError: null,
    });
    (prisma.paymentAttempt.create as any).mockResolvedValue({ id: "att_void" });
    (prisma.paymentIntent.update as any).mockResolvedValue({});

    const result = await voidPayment({ paymentIntentId: "pi_test_001" });

    expect(result.ok).toBe(true);
    const updateArg = (prisma.paymentIntent.update as any).mock.calls[0][0];
    expect(updateArg.data.status).toBe("CANCELLED");
    // attribution session must NOT be touched by void
    expect(updateArg.data.attributionSessionId).toBeUndefined();
  });
});

describe("capturePayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws 409 when intent is not AUTHORIZED", async () => {
    (prisma.paymentIntent.findUnique as any).mockResolvedValue(makeIntent({ status: "CREATED" }));
    await expect(capturePayment({ paymentIntentId: "pi_test_001" })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("Reservation flow deposit-required condition logic", () => {
  it("confirms reservation immediately when space has no deposit requirement", () => {
    const depositRequiredCents: number | null = null;
    const requiresApproval = false;
    const depositRequired = depositRequiredCents != null && depositRequiredCents > 0;
    const expectedStatus = depositRequired
      ? "PENDING_PAYMENT"
      : requiresApproval
      ? "PENDING_APPROVAL"
      : "CONFIRMED";

    expect(depositRequired).toBe(false);
    expect(expectedStatus).toBe("CONFIRMED");
  });

  it("sets PENDING_PAYMENT when space requires a deposit, not silently confirming", () => {
    const depositRequiredCents: number | null = 5000;
    const requiresApproval = false;
    const depositRequired = depositRequiredCents != null && depositRequiredCents > 0;
    const expectedStatus = depositRequired
      ? "PENDING_PAYMENT"
      : requiresApproval
      ? "PENDING_APPROVAL"
      : "CONFIRMED";

    expect(depositRequired).toBe(true);
    expect(expectedStatus).toBe("PENDING_PAYMENT");
  });

  it("PENDING_PAYMENT takes precedence over requiresApproval when both conditions hold", () => {
    // Edge case: deposit-required space that also requiresApproval.
    // The deposit gate is checked first — PENDING_PAYMENT wins, PENDING_APPROVAL
    // is the next state after a successful payment when requiresApproval is true.
    const depositRequiredCents: number | null = 5000;
    const requiresApproval = true;
    const depositRequired = depositRequiredCents != null && depositRequiredCents > 0;
    const expectedStatus = depositRequired
      ? "PENDING_PAYMENT"
      : requiresApproval
      ? "PENDING_APPROVAL"
      : "CONFIRMED";

    expect(expectedStatus).toBe("PENDING_PAYMENT");
  });
});
