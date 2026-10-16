import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { syncTranslations } from "@/server/i18n/eventTranslations";

const input = z.object({ name: z.string().trim().min(1).max(160), description: z.string().max(5000).nullable() }).strict();
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; addonId: string }> }) {
  try {
  const auth = await requireSession();
  if (!auth.roles.includes("SUPERADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter an English name and description only." }, { status: 400 });
  const { id, addonId } = await params;
  const addon = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Series" WHERE "id" = ${id} FOR UPDATE`;
    const current = await tx.experienceAddon.findFirst({ where: { id: addonId, seriesId: id } });
    if (!current) return null;
    const updated = await tx.experienceAddon.update({ where: { id: addonId }, data: parsed.data });
    await syncTranslations(tx, "ExperienceAddon", addonId, parsed.data);
    await tx.auditLog.create({ data: { actorId: auth.userId, action: "EVENT_ADDON_CONTENT_UPDATED", metadata: { seriesId: id, addonId, fields: ["name", "description"] } } });
    return updated;
  });
  return addon ? NextResponse.json({ addon }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Could not save add-on text." }, { status });
  }
}
