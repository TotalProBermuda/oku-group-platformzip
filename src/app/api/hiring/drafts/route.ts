import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();

  const draft = await prisma.applicationDraft.create({
    data: {
      opportunityId: body.opportunityId,
      formTemplateId: body.formTemplateId,
      userId: body.userId ?? null,
      source: body.source ?? "manual",
      templateVersion: body.templateVersion ?? 1,
      prefillJson: body.prefillJson ?? {},
      answersJson: body.answersJson ?? {},
      status: "DRAFT",
    },
  });

  return NextResponse.json(draft, { status: 201 });
}
