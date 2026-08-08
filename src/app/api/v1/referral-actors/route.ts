import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  createReferralActor,
  listReferralActors,
} from "@/server/referrals/referralActorService";
import { ReferralActorType, ReferralActorStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const { searchParams } = new URL(req.url);
    const actorType = searchParams.get("actorType") as ReferralActorType | null;
    const status = searchParams.get("status") as ReferralActorStatus | null;
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const result = await listReferralActors({ actorType: actorType ?? undefined, status: status ?? undefined, page, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const body = await req.json();
    const { actorType, displayName, organizationName, phone, email, whatsapp, userId, metadataJson } = body;

    if (!actorType || !displayName) {
      return NextResponse.json({ ok: false, error: "actorType and displayName are required" }, { status: 400 });
    }

    const actor = await createReferralActor({ actorType, displayName, organizationName, phone, email, whatsapp, userId, metadataJson });
    return NextResponse.json({ ok: true, actor }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
