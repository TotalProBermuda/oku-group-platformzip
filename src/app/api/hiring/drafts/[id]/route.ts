import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const draft = await prisma.applicationDraft.findUnique({
    where: { id },
    include: {
      opportunity: { select: { title: true, slug: true } },
      formTemplate: true,
    },
  });

  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(draft);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const draft = await prisma.applicationDraft.update({
    where: { id },
    data: {
      answersJson: body.answersJson ?? undefined,
      prefillJson: body.prefillJson ?? undefined,
      applicantProfileId: body.applicantProfileId ?? undefined,
      status: body.status ?? undefined,
    },
  });

  return NextResponse.json(draft);
}
