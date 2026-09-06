/**
 * Admin Commission Rules API
 *
 * GET  /api/v1/admin/commission-rules  — list rules (filterable)
 * POST /api/v1/admin/commission-rules  — create rule (SUPERADMIN only)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import type { CommissionTierType, CommissionScopeType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const { searchParams } = new URL(req.url);
    const tier = searchParams.get("tier") as CommissionTierType | null;
    const scopeType = searchParams.get("scopeType") as CommissionScopeType | null;
    const activeParam = searchParams.get("active");

    const where = {
      ...(tier ? { tier } : {}),
      ...(scopeType ? { scopeType } : {}),
      ...(activeParam !== null ? { active: activeParam !== "false" } : {}),
    };

    const rules = await prisma.commissionRule.findMany({
      where,
      orderBy: [{ scopeType: "asc" }, { tier: "asc" }, { version: "desc" }],
    });

    return NextResponse.json({ ok: true, data: rules });
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const body = await req.json();
    const {
      tier,
      scopeType,
      scopeId,
      revenueBasis,
      percentageBps,
      percentageCapCents,
      perPersonCents,
      maxTakeRateBps,
      label,
    } = body;

    if (!tier || !scopeType || percentageBps == null) {
      return NextResponse.json(
        { ok: false, error: "tier, scopeType, and percentageBps are required" },
        { status: 400 }
      );
    }

    // Assign version with a serializable transaction to prevent two concurrent
    // requests calculating the same version. The @@unique([scopeType, scopeId,
    // tier, version]) constraint is the safety net — if two requests race, one
    // will fail with a unique violation and the caller receives a 400.
    const rule = await prisma.$transaction(
      async (tx) => {
        // Lock the max-version row for this (scopeType, scopeId, tier) family.
        // $queryRaw prevents Prisma from issuing a plain SELECT (no lock).
        const lockRows = await tx.$queryRaw<Array<{ version: number }>>`
          SELECT version FROM "CommissionRule"
          WHERE "scopeType" = ${scopeType}::"CommissionScopeType"
            AND "scopeId" IS NOT DISTINCT FROM ${scopeId ?? null}
            AND "tier" = ${tier}::"CommissionTierType"
          ORDER BY version DESC
          LIMIT 1
          FOR UPDATE
        `;
        const nextVersion = (lockRows[0]?.version ?? 0) + 1;

        // A rule family has exactly one active version. Historical versions
        // remain queryable for allocation audit traces, but never compete in
        // live resolution.
        await tx.commissionRule.updateMany({
          where: {
            scopeType,
            scopeId: scopeId ?? null,
            tier,
            active: true,
          },
          data: { active: false },
        });

        return tx.commissionRule.create({
          data: {
            tier,
            scopeType,
            scopeId: scopeId ?? null,
            revenueBasis: revenueBasis ?? "COMMISSIONABLE_CENTS",
            percentageBps,
            percentageCapCents: percentageCapCents ?? null,
            perPersonCents: perPersonCents ?? null,
            maxTakeRateBps: maxTakeRateBps ?? null,
            version: nextVersion,
            active: true,
            label: label ?? null,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );

    return NextResponse.json({ ok: true, data: rule }, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 400 });
  }
}
