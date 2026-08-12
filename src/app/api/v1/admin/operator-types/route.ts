import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { ReferralActorType, ReferralCompensationMode } from "@prisma/client";

function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(req: NextRequest) {
  // The operator-type catalog is only used by admin tooling (the AddOperator
  // modal and the /admin/operator-types CRUD page). It controls ProofPay
  // referrer identity architecture, so only owners can read or mutate it.
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 401;
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status });
  }
  const onlyActive = req.nextUrl.searchParams.get("includeInactive") !== "1";
  const types = await prisma.referralActorTypeDef.findMany({
    where: onlyActive ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return NextResponse.json({ ok: true, types });
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const body = await req.json();
    const label = String(body?.label ?? "").trim();
    if (!label) return NextResponse.json({ ok: false, error: "label is required" }, { status: 400 });

    const code = body?.code ? slugify(String(body.code)) : slugify(label);
    if (!code) return NextResponse.json({ ok: false, error: "code could not be derived" }, { status: 400 });

    const exists = await prisma.referralActorTypeDef.findUnique({ where: { code } });
    if (exists) return NextResponse.json({ ok: false, error: `code "${code}" already exists` }, { status: 409 });

    const compModeRaw = body?.defaultCompMode ?? "PERCENT_OF_TRANSACTION";
    if (!Object.values(ReferralCompensationMode).includes(compModeRaw as ReferralCompensationMode)) {
      return NextResponse.json({ ok: false, error: `invalid defaultCompMode: ${compModeRaw}` }, { status: 400 });
    }

    // Custom types default to OTHER but admins can pin them to a specific
    // legacy enum case so downstream code paths that switch on the enum
    // (legacy referrer reports, RBAC pickers) keep grouping them sensibly.
    const legacyEnumRaw = body?.legacyEnumValue ?? "OTHER";
    if (!Object.values(ReferralActorType).includes(legacyEnumRaw as ReferralActorType)) {
      return NextResponse.json({ ok: false, error: `invalid legacyEnumValue: ${legacyEnumRaw}` }, { status: 400 });
    }

    const created = await prisma.referralActorTypeDef.create({
      data: {
        code,
        label,
        description: body?.description ? String(body.description).slice(0, 500) : null,
        icon: body?.icon ? String(body.icon).slice(0, 64) : null,
        isBuiltin: false,
        legacyEnumValue: legacyEnumRaw as ReferralActorType,
        defaultCompMode: compModeRaw as ReferralCompensationMode,
        defaultRateBps: typeof body?.defaultRateBps === "number" ? Math.round(body.defaultRateBps) : null,
        defaultFlatCents: typeof body?.defaultFlatCents === "number" ? Math.round(body.defaultFlatCents) : null,
        defaultRbacRole: body?.defaultRbacRole ? String(body.defaultRbacRole).slice(0, 64) : null,
        sortOrder: typeof body?.sortOrder === "number" ? body.sortOrder : 500,
        isActive: body?.isActive !== false,
        createdByUserId: userId,
      },
    });
    return NextResponse.json({ ok: true, type: created });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status ?? 500;
    const error = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ ok: false, error }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const body = await req.json();
    const code = String(body?.code ?? "").trim();
    if (!code) return NextResponse.json({ ok: false, error: "code is required" }, { status: 400 });

    const existing = await prisma.referralActorTypeDef.findUnique({ where: { code } });
    if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (typeof body?.label === "string" && body.label.trim()) data.label = body.label.trim();
    if (typeof body?.description === "string" || body?.description === null) data.description = body?.description;
    if (typeof body?.icon === "string" || body?.icon === null) data.icon = body?.icon;
    if (typeof body?.defaultCompMode === "string") {
      if (!Object.values(ReferralCompensationMode).includes(body.defaultCompMode as ReferralCompensationMode)) {
        return NextResponse.json({ ok: false, error: "invalid defaultCompMode" }, { status: 400 });
      }
      data.defaultCompMode = body.defaultCompMode;
    }
    if (typeof body?.defaultRateBps === "number" || body?.defaultRateBps === null) data.defaultRateBps = body?.defaultRateBps;
    if (typeof body?.defaultFlatCents === "number" || body?.defaultFlatCents === null) data.defaultFlatCents = body?.defaultFlatCents;
    if (typeof body?.defaultRbacRole === "string" || body?.defaultRbacRole === null) data.defaultRbacRole = body?.defaultRbacRole;
    if (typeof body?.sortOrder === "number") data.sortOrder = body.sortOrder;
    if (typeof body?.isActive === "boolean") {
      // Built-in types may be deactivated but never deleted, to preserve referential integrity.
      data.isActive = body.isActive;
    }

    const updated = await prisma.referralActorTypeDef.update({ where: { code }, data });
    return NextResponse.json({ ok: true, type: updated });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status ?? 500;
    const error = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ ok: false, error }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const code = req.nextUrl.searchParams.get("code")?.trim();
    if (!code) return NextResponse.json({ ok: false, error: "code is required" }, { status: 400 });

    const existing = await prisma.referralActorTypeDef.findUnique({ where: { code } });
    if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    if (existing.isBuiltin) {
      return NextResponse.json({ ok: false, error: "built-in types cannot be deleted; deactivate instead" }, { status: 400 });
    }

    // Refuse to delete a type that is still referenced by any actor — the
    // admin should reassign or deactivate instead, otherwise we silently
    // strand actors with a dangling code.
    const refCount = await prisma.referralActor.count({ where: { actorTypeCode: code } });
    if (refCount > 0) {
      return NextResponse.json(
        { ok: false, error: `type is in use by ${refCount} operator${refCount === 1 ? "" : "s"}; reassign or deactivate instead` },
        { status: 409 }
      );
    }

    await prisma.referralActorTypeDef.delete({ where: { code } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status ?? 500;
    const error = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ ok: false, error }, { status });
  }
}
