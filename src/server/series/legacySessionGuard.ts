import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

/** Legacy assignment mutations are retired, not bridged to an implicit apply.
 * A caller must inspect an exact preview before any roster/default mutation. */
export async function requireUnifiedAssignmentPreview() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:experiences:write");
    return NextResponse.json({ ok: false, error: managedWriteMessage }, { status: 409 });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 403;
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status });
  }
}

/** Old controls remain compatible for untouched data; once modes exist, the
 * preview policy is the sole writer. A legacy toggle must not discard modes. */
export async function legacySessionWriteBlocked(id: string, db: Prisma.TransactionClient = prisma) {
  const session = await db.session.findUnique({
    where: { id }, select: { fieldModes: true, series: { select: { sessionDefaults: true } } },
  });
  return Boolean(session?.fieldModes || session?.series?.sessionDefaults);
}
export async function legacySeriesWriteBlocked(id: string, db: Prisma.TransactionClient = prisma) {
  const series = await db.series.findUnique({ where: { id }, select: { sessionDefaults: true, sessions: { select: { fieldModes: true } } } });
  return Boolean(series?.sessionDefaults || series?.sessions?.some(s => s.fieldModes));
}
export const managedWriteMessage = "Use Session management preview to change managed defaults or occurrences. No changes were saved.";
export async function legacySeriesMutation<T>(id: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Series" WHERE "id" = ${id} FOR UPDATE`;
    if (await legacySeriesWriteBlocked(id, tx)) throw Object.assign(new Error(managedWriteMessage), { status: 409 });
    return operation(tx);
  });
}
