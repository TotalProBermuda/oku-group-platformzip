import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { roles, userId } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { note } = body as { note?: string };

  if (!note?.trim()) {
    return NextResponse.json({ ok: false, error: "note is required" }, { status: 400 });
  }

  const item = await prisma.integrationReviewQueue.findUnique({
    where: { id: params.id },
    select: { id: true, detailJson: true, status: true },
  });
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const detail = (item.detailJson as Record<string, unknown>) ?? {};
  const rawNotes = detail.internalNotes;
  const existingNotes: string[] = Array.isArray(rawNotes)
    ? rawNotes.filter((n): n is string => typeof n === "string")
    : [];
  const timestamp = new Date().toISOString();
  const newNoteEntry = `[${timestamp}] (userId=${userId}): ${note.trim()}`;

  await prisma.integrationReviewQueue.update({
    where: { id: params.id },
    data: {
      status: item.status === "OPEN" ? "IN_REVIEW" : item.status,
      detailJson: {
        ...detail,
        internalNotes: [...existingNotes, newNoteEntry],
      },
    },
  });

  return NextResponse.json({ ok: true });
}
