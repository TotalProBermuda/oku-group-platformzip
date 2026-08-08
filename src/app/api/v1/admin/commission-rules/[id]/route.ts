/**
 * Admin Commission Rules — single rule
 *
 * PATCH /api/v1/admin/commission-rules/[id]
 *   Deactivate or relabel a rule (SUPERADMIN / ADMIN_FINANCE only).
 *   Economics (percentageBps, perPersonCents, etc.) cannot be patched on an
 *   existing rule — create a new version instead. This preserves the audit
 *   trail for every allocation that references a specific ruleVersionId.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

const SUPERADMIN_ROLES = ["SUPERADMIN", "ADMIN_FINANCE"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:revenue:write");
    if (!roles.some((r) => SUPERADMIN_ROLES.includes(r as (typeof SUPERADMIN_ROLES)[number]))) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: SUPERADMIN or ADMIN_FINANCE required to update commission rules." },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Only allow safe mutations — deactivate or relabel.
    const allowedKeys = ["active", "label"];
    const data: Record<string, unknown> = {};
    for (const k of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        data[k] = body[k];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nothing to update. Only 'active' and 'label' can be patched." },
        { status: 400 }
      );
    }

    const rule = await prisma.commissionRule.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, data: rule });
  } catch (e: unknown) {
    const err = e as Error & { code?: string; status?: number };
    if (err.code === "P2025") {
      return NextResponse.json({ ok: false, error: "Rule not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 400 });
  }
}
