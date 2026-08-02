import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { WIDGET_REGISTRY } from "@/lib/hiring/widget-registry";

export async function GET() {
  const custom = await prisma.customFormWidget.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ system: WIDGET_REGISTRY, custom });
}

export async function POST(req: Request) {
  const body = await req.json();

  const widget = await prisma.customFormWidget.create({
    data: {
      name:                  body.name,
      slug:                  body.slug,
      description:           body.description ?? null,
      widgetSchemaJson:      body.widgetSchemaJson,
      previewSchemaJson:     body.previewSchemaJson ?? null,
      defaultValidationJson: body.defaultValidationJson ?? null,
      createdById:           body.createdById ?? null,
    },
  });

  return NextResponse.json(widget, { status: 201 });
}
