import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();

    const staff = await prisma.staffProfile.findUnique({
      where: { userId },
    });

    if (!staff) {
      return NextResponse.json({ ok: false, error: "No staff profile found" }, { status: 403 });
    }

    const body = await req.json();
    const { sopId } = body;

    if (!sopId) {
      return NextResponse.json({ ok: false, error: "sopId is required" }, { status: 400 });
    }

    const sop = await prisma.sopDocument.findUnique({ where: { id: sopId } });
    if (!sop) {
      return NextResponse.json({ ok: false, error: "SOP not found" }, { status: 404 });
    }

    await prisma.sopAcknowledgement.upsert({
      where: {
        sopId_staffProfileId: {
          sopId,
          staffProfileId: staff.id,
        },
      },
      update: { acknowledgedAt: new Date() },
      create: {
        sopId,
        staffProfileId: staff.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
