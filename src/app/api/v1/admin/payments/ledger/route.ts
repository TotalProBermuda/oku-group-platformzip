/**
 * Admin Payment Ledger API (Payments P215)
 *
 * GET /api/v1/admin/payments/ledger
 * Returns paginated list of PaymentIntents (reservation deposits) with
 * linked reservation, latest attempt, and status. No raw card data is
 * stored or returned.
 *
 * Query params:
 *   status  — filter by PaymentIntentStatus
 *   page    — 1-based page number (default 1)
 *   limit   — rows per page (default 25, max 100)
 *   search  — search by reservationId, cybersourceTransactionId, or confirmationCode
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import type { PaymentIntentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_STATUSES: PaymentIntentStatus[] = [
  "CREATED",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN", "ADMIN_FINANCE"]);

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") as PaymentIntentStatus | null;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
    const search = searchParams.get("search")?.trim() || null;

    const statusFilter =
      statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined;

    const where: any = {};
    if (statusFilter) where.status = statusFilter;
    if (search) {
      where.OR = [
        { cybersourceTransactionId: { contains: search, mode: "insensitive" } },
        { reservationId: { contains: search, mode: "insensitive" } },
        { reservation: { confirmationCode: { contains: search, mode: "insensitive" } } },
        { reservation: { contactEmail: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.paymentIntent.count({ where }),
      prisma.paymentIntent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          reservation: {
            select: {
              id: true,
              confirmationCode: true,
              contactName: true,
              contactEmail: true,
              partySize: true,
              reservationDate: true,
              status: true,
            },
          },
          attempts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              amountCents: true,
              cybersourceTransactionId: true,
              cybersourceResponseCode: true,
              failureCode: true,
              failureMessage: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const data = rows.map((intent) => ({
      id: intent.id,
      reservationId: intent.reservationId,
      orderType: intent.orderType,
      amountCents: intent.amountCents,
      currency: intent.currency,
      status: intent.status,
      provider: intent.provider,
      cybersourceTransactionId: intent.cybersourceTransactionId,
      lastFailureCode: intent.lastFailureCode,
      lastFailureMessage: intent.lastFailureMessage,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
      reservation: intent.reservation
        ? {
            id: intent.reservation.id,
            confirmationCode: intent.reservation.confirmationCode,
            contactName: intent.reservation.contactName,
            contactEmail: intent.reservation.contactEmail,
            partySize: intent.reservation.partySize,
            reservationDate: intent.reservation.reservationDate.toISOString(),
            status: intent.reservation.status,
          }
        : null,
      latestAttempt: intent.attempts[0] ?? null,
    }));

    return NextResponse.json({
      ok: true,
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message ?? "Unknown error" },
      { status: err.status ?? 500 },
    );
  }
}
