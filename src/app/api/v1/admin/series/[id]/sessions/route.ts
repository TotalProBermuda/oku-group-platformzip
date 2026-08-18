import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requireSession } from "@/server/auth/session";
import { createSessionInputSchema } from "@/server/series/createSessionInput";
import { createReservationConflictRecords } from "@/server/events/eventOccupancyService";
import { lockOccupancySpaces } from "@/server/series/publicationLifecycle";

function failure(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 500;
  if (status < 500) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Request denied" }, { status });
  }
  console.error("Unable to manage admin events", error);
  return NextResponse.json({ ok: false, error: "Unable to complete this request. Please try again." }, { status: 500 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: seriesId } = await params;
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:experiences:write");

    const body = createSessionInputSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { ok: false, error: "Please correct the highlighted details.", fields: body.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const parent = await prisma.series.findUnique({
      where: { id: seriesId },
      select: { id: true, venueId: true, spaceId: true, status: true },
    });
    if (!parent) return NextResponse.json({ ok: false, error: "Series not found." }, { status: 404 });
    if (body.data.occupancyScope !== "NONE" && !parent.venueId) {
      return NextResponse.json({ ok: false, error: "Select an operational venue before creating a dining block." }, { status: 400 });
    }
    if (body.data.occupancyScope === "SPACE" && !parent.spaceId) {
      return NextResponse.json({ ok: false, error: "Select a physical space or choose Whole venue / Ticket-only." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          seriesId,
          title: body.data.title || null,
          startsAt: body.data.startsAt,
          endsAt: body.data.endsAt,
          capacity: body.data.capacity,
          status: "SCHEDULED",
        },
      });
      let occupancy = null;
      let conflictCount = 0;
      if (body.data.occupancyScope !== "NONE" && parent.venueId) {
        const scope = body.data.occupancyScope;
        const spaceId = scope === "SPACE" ? parent.spaceId : null;
        await lockOccupancySpaces(tx, parent.venueId, scope, spaceId);
        occupancy = await tx.eventSpaceOccupancy.create({
          data: {
            seriesId,
            sessionId: created.id,
            venueId: parent.venueId,
            spaceId,
            scope,
            policy: "EXCLUSIVE",
            status: parent.status === "PUBLISHED" ? "ACTIVE" : "DRAFT",
            eventStartsAt: body.data.startsAt,
            eventEndsAt: body.data.endsAt,
            blockStartsAt: new Date(body.data.startsAt.getTime() - body.data.setupMinutes * 60_000),
            blockEndsAt: new Date(body.data.endsAt.getTime() + body.data.resetMinutes * 60_000),
            setupMinutes: body.data.setupMinutes,
            resetMinutes: body.data.resetMinutes,
            createdByUserId: userId,
          },
        });
        const conflicts = await createReservationConflictRecords(tx, occupancy);
        conflictCount = conflicts.length;
        if (conflictCount) {
          const recipients = await tx.user.findMany({
            where: { roles: { some: { roleKey: { in: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] } } } },
            select: { id: true },
          });
          await tx.notification.createMany({
            data: recipients.map((user) => ({
              userId: user.id,
              title: "Reservations need review for a new event",
              body: `${conflictCount} existing reservation(s) overlap this event. No guest was cancelled automatically.`,
              href: `/admin/experiences/${seriesId}`,
            })),
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "EXPERIENCE_SESSION_CREATED",
          metadata: { seriesId, sessionId: created.id, occupancyId: occupancy?.id ?? null, conflicts: conflictCount },
        },
      });
      return { event: created, occupancy, conflictCount };
    });
    return NextResponse.json({ ok: true, data: result.event, occupancy: result.occupancy, conflictCount: result.conflictCount }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
