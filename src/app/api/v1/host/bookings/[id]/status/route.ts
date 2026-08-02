import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { transitionStatus } from "@/server/host/hostService";
import type { ReservationStatus } from "@prisma/client";

const VALID_STATUSES: ReservationStatus[] = [
  "PENDING", "CONFIRMED", "WAITLISTED", "ACKNOWLEDGED",
  "ARRIVED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Status transitions are operational reservation control: only restaurant
  // hosts / admins (host:reservations:checkin) may change a booking's status.
  // This also closes a pre-existing hole where ANY logged-in user could mutate
  // ANY reservation's status. Referral-only roles (STREETSIDE_HOST) are
  // read-only here.
  let userId: string;
  try {
    const s = await requireSession();
    userId = s.userId;
    requirePermission(s.roles, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }
  const { id } = await params;
  const body = await req.json();

  const { status, tableLabel, lossReason, lossReasonNotes, internalNotes, arrivedHeadcount } = body;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Sanity-check arrivedHeadcount: must be a positive integer if provided.
  // Bigger-than-partySize is allowed (host might add a +1 the booking didn't
  // know about) — that's a UX nuance, not a data integrity violation.
  let parsedHeadcount: number | undefined;
  if (arrivedHeadcount !== undefined && arrivedHeadcount !== null) {
    const n = Number(arrivedHeadcount);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "arrivedHeadcount must be a positive integer" }, { status: 400 });
    }
    parsedHeadcount = n;
  }

  try {
    const reservation = await transitionStatus(id, status as ReservationStatus, userId, {
      tableLabel,
      lossReason,
      lossReasonNotes,
      internalNotes,
      arrivedHeadcount: parsedHeadcount,
    });
    return NextResponse.json({ ok: true, data: reservation });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
