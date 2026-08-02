import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const templates = await prisma.formTemplate.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const body = await req.json();

  const template = await prisma.formTemplate.create({
    data: {
      name: body.name,
      slug: body.slug,
      category: body.category ?? null,
      status: body.status ?? "DRAFT",
      description: body.description ?? null,
      version: 1,
      schemaJson: body.schemaJson,
      uiSchemaJson: body.uiSchemaJson ?? null,
      validationJson: body.validationJson ?? null,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
