import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

const ALLOWED_STATUSES = new Set(["NO_SHOW", "CANCELLED", "SEATED", "READY"]);

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const status = typeof body?.status === "string" ? body.status : null;

    if (!status || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "status must be one of NO_SHOW, CANCELLED, SEATED, READY" },
        { status: 400 },
      );
    }

    const existing = await prisma.resWaitlistEntry.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Waitlist entry not found" }, { status: 404 });
    }

    const updated = await prisma.resWaitlistEntry.update({
      where: { id },
      data: { status: status as "NO_SHOW" | "CANCELLED" | "SEATED" | "READY" },
      select: { id: true, status: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, entry: updated });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    if (!err.status) console.error("[PATCH /api/v1/host/waitlist/:id]", e);
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: err.status ?? 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");

    const { id } = await ctx.params;
    const existing = await prisma.resWaitlistEntry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Waitlist entry not found" }, { status: 404 });
    }
    await prisma.resWaitlistEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    if (!err.status) console.error("[DELETE /api/v1/host/waitlist/:id]", e);
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: err.status ?? 500 },
    );
  }
}
