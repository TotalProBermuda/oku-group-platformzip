import { NextRequest, NextResponse } from "next/server";
import { PartnerCommerceRole } from "@prisma/client";
import { requireSession } from "@/server/auth/session";
import {
  createPartnerDirectChannelDraft,
  createPartnerSellerDraft,
  getPartnerCommerceWorkspace,
} from "@/server/partnerCommerce/draftWorkspace";

const PARTNER_ROLES = new Set(["PARTNER"]);
const COMMERCE_ROLES = new Set(Object.values(PartnerCommerceRole));

async function authenticatePartner() {
  const { userId, roles } = await requireSession();
  if (!roles.some((role) => PARTNER_ROLES.has(role))) {
    const error = new Error("Forbidden") as Error & { status: number };
    error.status = 403;
    throw error;
  }
  return userId;
}

export async function GET() {
  try {
    const userId = await authenticatePartner();
    const workspace = await getPartnerCommerceWorkspace(userId);
    if (!workspace) return NextResponse.json({ error: "Partner profile not found" }, { status: 404 });
    return NextResponse.json({ workspace });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: status === 500 ? "Unable to load partner commerce" : "Unauthorized" }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticatePartner();
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "create_direct_channel_draft") {
      return NextResponse.json({ channel: await createPartnerDirectChannelDraft({ userId }) }, { status: 201 });
    }
    if (body.action === "create_seller_draft") {
      const commercialRole = typeof body.commercialRole === "string" ? body.commercialRole : "";
      if (!COMMERCE_ROLES.has(commercialRole as PartnerCommerceRole)) {
        return NextResponse.json({ error: "Choose a valid commercial role" }, { status: 400 });
      }
      const seat = await createPartnerSellerDraft({
        userId,
        displayName: typeof body.displayName === "string" ? body.displayName : "",
        email: typeof body.email === "string" ? body.email : "",
        commercialRole: commercialRole as PartnerCommerceRole,
        notes: typeof body.notes === "string" ? body.notes : undefined,
      });
      return NextResponse.json({ seat }, { status: 201 });
    }
    return NextResponse.json({ error: "Unknown partner commerce action" }, { status: 400 });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Unable to save partner commerce";
    return NextResponse.json({ error: status === 500 ? message : "Unauthorized" }, { status });
  }
}
