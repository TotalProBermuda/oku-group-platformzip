import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

/**
 * Lightweight typeahead for the Referral Organization Resolver "Link"
 * action. Phase A uses `contains` (case-insensitive). Phase B should
 * upgrade this to pg_trgm + similarity scoring with a threshold band.
 */
export async function GET(req: Request) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const items = await prisma.entity.findMany({
      where: { displayName: { contains: q, mode: "insensitive" } },
      select: {
        id: true,
        displayName: true,
        type: true,
        organizationKind: true,
        websiteUrl: true,
      },
      orderBy: { displayName: "asc" },
      take: 20,
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: e?.status ?? 500 },
    );
  }
}
