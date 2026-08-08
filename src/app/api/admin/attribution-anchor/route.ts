/**
 * Admin API — Attribution Anchor Review
 *
 * GET  /api/admin/attribution-anchor   — list PENDING_ATTRIBUTION + FAILED_REVIEW sessions
 * POST /api/admin/attribution-anchor   — retry or manually resolve a session
 *   body: { action: "retry" | "resolve", attributionSessionId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emitLedgerEvent } from "@/server/services/ledger/ledgerEventService";
import { ensureAnchorWrites } from "@/../worker/jobs/attribution-anchor-retry";
import type { Prisma } from "@prisma/client";

function isAdmin(session: any): boolean {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN"].includes(r)) ?? false;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // PENDING_ATTRIBUTION | FAILED_REVIEW | all
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Number(searchParams.get("limit") ?? "50"));
  const skip = (page - 1) * limit;

  const where: Prisma.AttributionSessionWhereInput =
    status === "PENDING_ATTRIBUTION" || status === "FAILED_REVIEW"
      ? { anchorStatus: status }
      : { anchorStatus: { in: ["PENDING_ATTRIBUTION", "FAILED_REVIEW"] } };

  const [sessions, total] = await Promise.all([
    prisma.attributionSession.findMany({
      where,
      skip,
      take: limit,
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        source: true,
        status: true,
        anchorStatus: true,
        anchorRetryCount: true,
        anchorLastError: true,
        anchorLastAttemptAt: true,
        anchorResolvedAt: true,
        openedAt: true,
        reservationId: true,
        referralActorId: true,
        legacyReferrerId: true,
        referralLinkId: true,
        bookingCode: true,
        venueId: true,
        referralActor: { select: { id: true, displayName: true, actorType: true } },
        legacyReferrer: { select: { id: true, fullName: true, referrerType: true } },
        reservation: {
          select: {
            id: true,
            contactName: true,
            partySize: true,
            reservationDate: true,
            conceptRequested: true,
          },
        },
      },
    }),
    prisma.attributionSession.count({ where }),
  ]);

  return NextResponse.json({ sessions, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminUserId: string = (session.user as any).id ?? "unknown";

  const body = await req.json();
  const { action, attributionSessionId } = body as {
    action: "retry" | "resolve";
    attributionSessionId: string;
  };

  if (!attributionSessionId) {
    return NextResponse.json({ error: "attributionSessionId is required" }, { status: 400 });
  }

  const target = await prisma.attributionSession.findUnique({
    where: { id: attributionSessionId },
    select: {
      id: true,
      anchorStatus: true,
      anchorRetryCount: true,
      referralActorId: true,
      legacyReferrerId: true,
      reservationId: true,
    },
  });

  if (!target) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (action === "retry") {
    if (target.anchorStatus !== "PENDING_ATTRIBUTION") {
      return NextResponse.json(
        { error: `Cannot retry a session in ${target.anchorStatus} state` },
        { status: 400 }
      );
    }
    try {
      const { attributionAnchorQueue } = await import("@/server/queue/queue");
      if (attributionAnchorQueue) {
        await attributionAnchorQueue.add(
          "attribution_anchor_retry",
          { attributionSessionId },
          { priority: 1, attempts: 3, backoff: { type: "exponential", delay: 5000 } }
        );
      } else {
        // No Redis — run inline.
        const { handleAttributionAnchorRetryJob } = await import(
          "@/../worker/jobs/attribution-anchor-retry"
        );
        await handleAttributionAnchorRetryJob({ data: { attributionSessionId } } as any);
      }
    } catch (err) {
      console.error("[admin/attribution-anchor] retry enqueue failed", err);
      return NextResponse.json({ error: "Failed to enqueue retry" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "retry_enqueued" });
  }

  if (action === "resolve") {
    if (target.anchorStatus !== "FAILED_REVIEW") {
      return NextResponse.json(
        { error: `Cannot manually resolve a session in ${target.anchorStatus} state` },
        { status: 400 }
      );
    }
    if (!target.referralActorId && !target.legacyReferrerId) {
      return NextResponse.json(
        { error: "Session has no preserved referrer context to anchor to" },
        { status: 400 }
      );
    }

    // Run the same idempotent anchor writes as the retry worker so all
    // missing legacy rows are actually created, not just status-flipped.
    try {
      await ensureAnchorWrites(target);
    } catch (writeErr) {
      const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
      // Preserve error state so admin can see what is still blocking.
      await prisma.attributionSession.update({
        where: { id: attributionSessionId },
        data: { anchorLastError: msg, anchorLastAttemptAt: new Date() },
      });
      return NextResponse.json(
        { error: `Anchor write failed: ${msg}` },
        { status: 422 }
      );
    }

    const now = new Date();
    await prisma.attributionSession.update({
      where: { id: attributionSessionId },
      data: {
        anchorStatus: "ANCHORED",
        anchorResolvedAt: now,
        anchorLastError: null,
        anchorLastAttemptAt: now,
      },
    });

    try {
      await emitLedgerEvent({
        eventType: "ATTRIBUTION_ANCHOR_RESOLVED",
        source: { system: "admin_manual_resolve" },
        confidenceClass: "MANUAL_REVIEW_EVENT",
        idempotencyKey: `attribution_session:${attributionSessionId}:anchor_resolved`,
        attributionSessionId,
        reservationId: target.reservationId ?? null,
        payload: {
          resolvedByAdminId: adminUserId,
          referralActorId: target.referralActorId ?? null,
          legacyReferrerId: target.legacyReferrerId ?? null,
          method: "admin_manual",
        },
      });
    } catch (ledgerErr) {
      console.warn("[admin/attribution-anchor] ledger event failed (non-blocking)", ledgerErr);
    }

    return NextResponse.json({ ok: true, action: "resolved" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
