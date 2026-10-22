import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";
import type { HandoffStatus, ReservationStatus } from "@prisma/client";

const HandoffUpdateBody = z.object({
  handoffStatus: z.enum(["PENDING", "ACKNOWLEDGED", "GUEST_EN_ROUTE", "GUEST_ARRIVED", "SEATED", "CLOSED", "CANCELLED"]),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // This legacy route was fully unauthenticated and syncs reservation status as
  // a side effect. Gate it as operational reservation control (restaurant
  // hosts / admins only) — referral-only roles and anonymous callers are denied.
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }
  try {
    const { id } = await params;
    const parsed = HandoffUpdateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid handoff update." }, { status: 400 });
    const { handoffStatus, notes } = parsed.data;
    const handoff = await prisma.reservationHandoff.update({
      where: { id },
      data: {
        handoffStatus,
        notes: notes ?? undefined,
        actualArrivalAt: handoffStatus === "GUEST_ARRIVED" ? new Date() : undefined,
      },
    });

    // Sync reservation status based on handoff status
    const statusMap: Partial<Record<HandoffStatus, ReservationStatus>> = {
      ACKNOWLEDGED: "ACKNOWLEDGED",
      GUEST_EN_ROUTE: "CONFIRMED",
      GUEST_ARRIVED: "ARRIVED",
      SEATED: "SEATED",
    };
    const resStatus = statusMap[handoffStatus];
    if (resStatus) {
      await prisma.reservation.update({
        where: { id: handoff.reservationId },
        data: { status: resStatus },
      });
    }

    return NextResponse.json({ success: true, handoff });
  } catch (err) {
    console.error("[PATCH /api/host/handoffs/:id]", err);
    return NextResponse.json({ error: "Failed to update handoff." }, { status: 500 });
  }
}
