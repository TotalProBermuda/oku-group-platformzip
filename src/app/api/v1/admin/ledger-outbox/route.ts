/**
 * Admin API — Ledger Event Outbox
 *
 * GET  /api/v1/admin/ledger-outbox        — list FAILED_REVIEW rows (paginated)
 * POST /api/v1/admin/ledger-outbox/retry  — reset one row back to PENDING
 * POST /api/v1/admin/ledger-outbox/retry-all — reset all FAILED_REVIEW rows
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

/** Any admin role may read the outbox (GET). */
async function requireReadAccess() {
  const session = await requireSession();
  const ok = session.roles.some((r) =>
    ["SUPERADMIN", "ADMIN_FINANCE"].includes(r)
  );
  if (!ok) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return session;
}

/** Only SUPERADMIN or ADMIN_FINANCE may trigger retry mutations (POST). */
async function requireRetryAccess() {
  const session = await requireSession();
  const ok = session.roles.some((r) => ["SUPERADMIN", "ADMIN_FINANCE"].includes(r));
  if (!ok) {
    const err = new Error("Forbidden: retry requires SUPERADMIN or ADMIN_FINANCE") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return session;
}

export async function GET(req: NextRequest) {
  try {
    await requireReadAccess();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "FAILED_REVIEW";
    const take = Math.min(Number(searchParams.get("take") ?? "50"), 200);
    const cursor = searchParams.get("cursor") ?? undefined;

    const rows = await prisma.ledgerEventOutbox.findMany({
      where: { status: status as "PENDING" | "PROCESSING" | "EMITTED" | "FAILED_REVIEW" },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        eventType: true,
        sourceSystem: true,
        sourceConnector: true,
        idempotencyKey: true,
        confidenceClass: true,
        status: true,
        attemptCount: true,
        lastAttemptAt: true,
        lastError: true,
        createdAt: true,
        reservationId: true,
        attributionSessionId: true,
        capacityHoldId: true,
        commissionAllocationId: true,
        payload: true,
        emittedLedgerEventId: true,
        // Human-readable business context — shown in the Business Object column
        reservation: {
          select: { confirmationCode: true, contactName: true, reservationDate: true, partySize: true },
        },
        capacityHold: {
          select: {
            partySize: true,
            space: { select: { name: true } },
          },
        },
        commissionAllocation: {
          select: { amountCents: true, earnerType: true, earnerRefId: true },
        },
        attributionSession: {
          select: {
            referralActor: { select: { displayName: true } },
          },
        },
      },
    });

    const hasMore = rows.length > take;
    const data = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? data[data.length - 1]?.id : null;

    // Aggregate counts per status for the UI overview banner
    const counts = await prisma.ledgerEventOutbox.groupBy({
      by: ["status"],
      _count: { id: true },
    });
    const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

    // Health metrics
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const emittedLast24h = await prisma.ledgerEventOutbox.count({
      where: { status: "EMITTED", updatedAt: { gte: since24h } },
    });
    const oldestPending = await prisma.ledgerEventOutbox.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const oldestPendingAgeMin = oldestPending
      ? Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 60_000)
      : null;

    return NextResponse.json({ ok: true, data, nextCursor, statusCounts, emittedLast24h, oldestPendingAgeMin });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "error" }, { status: err.status ?? 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRetryAccess();
    const body = await req.json().catch(() => ({}));
    const { action, id } = body as { action?: string; id?: string };

    if (action === "retry" && id) {
      // Reset a single FAILED_REVIEW row back to PENDING with a fresh retry budget.
      // attemptCount is reset to 0 so the row gets MAX_ATTEMPTS retries, not 0.
      const updated = await prisma.ledgerEventOutbox.updateMany({
        where: { id, status: "FAILED_REVIEW" },
        data: { status: "PENDING", lastError: null, attemptCount: 0 },
      });
      return NextResponse.json({ ok: true, updated: updated.count });
    }

    if (action === "retry-all") {
      // Reset ALL FAILED_REVIEW rows to PENDING with fresh retry budgets.
      const updated = await prisma.ledgerEventOutbox.updateMany({
        where: { status: "FAILED_REVIEW" },
        data: { status: "PENDING", lastError: null, attemptCount: 0 },
      });
      return NextResponse.json({ ok: true, updated: updated.count });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "error" }, { status: err.status ?? 500 });
  }
}
