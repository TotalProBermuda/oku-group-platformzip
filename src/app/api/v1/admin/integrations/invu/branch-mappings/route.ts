import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBranchMappings, createBranchMapping } from "@/server/services/invu/invuIntegrationService";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user?.roles?.includes("SUPERADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const venueId = searchParams.get("venueId");

  if (!venueId) {
    return NextResponse.json({ error: "venueId required" }, { status: 400 });
  }

  const mappings = await getBranchMappings(venueId);
  return NextResponse.json({ mappings });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user?.roles?.includes("SUPERADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { venueId, credentialId, invuBranchId, invuBranchLabel, syncIntervalMinutes } = body;

  if (!venueId || !credentialId || !invuBranchId) {
    return NextResponse.json({ error: "venueId, credentialId and invuBranchId required" }, { status: 400 });
  }

  try {
    const id = await createBranchMapping({ venueId, credentialId, invuBranchId, invuBranchLabel, syncIntervalMinutes });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 422 });
  }
}
