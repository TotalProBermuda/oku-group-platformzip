import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requireSession } from "@/server/auth/session";
import { createSessionInputSchema } from "@/server/series/createSessionInput";

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

    const parent = await prisma.series.findUnique({ where: { id: seriesId }, select: { id: true } });
    if (!parent) return NextResponse.json({ ok: false, error: "Series not found." }, { status: 404 });

    const event = await prisma.$transaction(async (tx) => {
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
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "EXPERIENCE_SESSION_CREATED",
          metadata: { seriesId, sessionId: created.id },
        },
      });
      return created;
    });
    return NextResponse.json({ ok: true, data: event }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
