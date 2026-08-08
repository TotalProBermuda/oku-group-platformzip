import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { createAttributionSession } from "@/server/services/invu/identityService";
import { recordIntegrationAudit } from "@/server/services/invu/invuAuditService";

type Body = {
  venueId?: string;
  tableLabel?: string;
  zoneId?: string | null;
  contactName?: string;
  partySize?: number;
  notes?: string | null;
  hostUserId?: string | null;
  hostProfileId?: string | null;
  referralActorId?: string | null;
  legacyReferrerId?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");

    const body = (await req.json()) as Body;
    if (!body.venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required" }, { status: 400 });
    }
    if (!body.tableLabel?.trim()) {
      return NextResponse.json({ ok: false, error: "tableLabel is required" }, { status: 400 });
    }
    if (!body.contactName?.trim()) {
      return NextResponse.json({ ok: false, error: "contactName is required" }, { status: 400 });
    }
    if (!body.partySize || body.partySize < 1) {
      return NextResponse.json({ ok: false, error: "partySize is required (>=1)" }, { status: 400 });
    }

    const result = await createAttributionSession({
      kind: "WALKIN",
      // Walk-ins are minted at seating time; the row goes straight to SEATED.
      source: "HOST_WALKIN",
      initialStatus: "SEATED",
      venueId: body.venueId,
      tableLabel: body.tableLabel.trim(),
      zoneId: body.zoneId ?? null,
      walkinContactName: body.contactName.trim(),
      walkinPartySize: body.partySize,
      walkinNotes: body.notes ?? null,
      hostUserId: body.hostUserId ?? userId ?? null,
      hostProfileId: body.hostProfileId ?? null,
      referralActorId: body.referralActorId ?? null,
      legacyReferrerId: body.legacyReferrerId ?? null,
      createdByUserId: userId ?? null,
    });

    await recordIntegrationAudit("HOST_WALKIN_ATTRIBUTION", userId ?? null, null, {
      venueId: body.venueId,
      contactName: body.contactName,
      partySize: body.partySize,
      ...result,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
