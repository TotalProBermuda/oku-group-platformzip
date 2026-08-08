import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

export async function GET() {
  try {
    const { userId } = await requireSession();

    const staff = await prisma.staffProfile.findUnique({
      where: { userId },
    });

    if (!staff) {
      return NextResponse.json({ ok: false, error: "No staff profile found" }, { status: 403 });
    }

    const sops = await prisma.sopDocument.findMany({
      where: { isActive: true },
      include: {
        acknowledgements: {
          where: { staffProfileId: staff.id },
        },
      },
      orderBy: [{ department: "asc" }, { title: "asc" }],
    });

    const data = sops.map((sop) => ({
      id: sop.id,
      title: sop.title,
      department: sop.department,
      venue: sop.venue,
      version: sop.version,
      acknowledged: sop.acknowledgements.length > 0,
      acknowledgedAt: sop.acknowledgements[0]?.acknowledgedAt || null,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    if (e.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
