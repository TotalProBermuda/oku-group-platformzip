import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { generateReferralLink, getActorLinks, deactivateLink } from "@/server/referrals/referralLinkService";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const links = await getActorLinks(id);
    return NextResponse.json({ ok: true, links });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const body = await req.json();
    const { referralAssignmentId, pathHint } = body;

    const link = await generateReferralLink({
      referralActorId: id,
      referralAssignmentId,
      pathHint,
    });

    return NextResponse.json({ ok: true, link }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}

export async function DELETE(req: NextRequest, { params: _ }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const body = await req.json();
    if (!body.linkId) {
      return NextResponse.json({ ok: false, error: "linkId is required" }, { status: 400 });
    }

    await deactivateLink(body.linkId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
