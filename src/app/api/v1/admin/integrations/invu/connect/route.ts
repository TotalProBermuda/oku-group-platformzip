import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authenticateInvu } from "@/server/services/invu/invuAuthService";
import type { ApiUserType } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user?.roles?.includes("SUPERADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { username, password, apiUserType, apiUserExpiresAt, venueId, branchScoped } = body;

  if (!username || !password || !apiUserType || !venueId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    await authenticateInvu(username, password, venueId, {
      apiUserType: apiUserType as ApiUserType,
      apiUserExpiresAt: apiUserExpiresAt ? new Date(apiUserExpiresAt) : null,
      branchScoped: branchScoped ?? false,
      userId: session.user.id as string,
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    return NextResponse.json({ success: true, status: "CONNECTED" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connection failed" },
      { status: 422 }
    );
  }
}
