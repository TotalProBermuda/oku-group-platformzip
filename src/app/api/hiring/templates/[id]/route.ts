import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const template = await prisma.formTemplate.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 5 },
      _count: { select: { opportunities: true } },
    },
  });

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const template = await prisma.formTemplate.update({
    where: { id },
    data: {
      name:          body.name          ?? undefined,
      description:   body.description   ?? undefined,
      schemaJson:    body.schemaJson     ?? undefined,
      uiSchemaJson:  body.uiSchemaJson   ?? undefined,
      validationJson:body.validationJson ?? undefined,
      status:        body.status         ?? undefined,
    },
  });

  return NextResponse.json(template);
}
