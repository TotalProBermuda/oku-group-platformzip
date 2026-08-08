import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  getReferralActorById,
  updateReferralActor,
} from "@/server/referrals/referralActorService";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const actor = await getReferralActorById(id);
    if (!actor) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, actor });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const body = await req.json();
    const actor = await updateReferralActor(id, body);
    return NextResponse.json({ ok: true, actor });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
