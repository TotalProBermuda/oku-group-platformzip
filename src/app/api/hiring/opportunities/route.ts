import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const items = await prisma.opportunity.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      formTemplate: { select: { id: true, name: true, version: true, status: true } },
      pipeline: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();

  const item = await prisma.opportunity.create({
    data: {
      title: body.title,
      slug: body.slug,
      department: body.department ?? null,
      engagementType: body.engagementType,
      employmentCategory: body.employmentCategory,
      compensationType: body.compensationType ?? null,
      compensationMin: body.compensationMin ?? null,
      compensationMax: body.compensationMax ?? null,
      currency: body.currency ?? "USD",
      description: body.description ?? null,
      responsibilities: body.responsibilities ?? null,
      requirements: body.requirements ?? null,
      preferredQualifications: body.preferredQualifications ?? null,
      openingsCount: body.openingsCount ?? null,
      visibility: body.visibility ?? "PUBLIC",
      status: body.status ?? "DRAFT",
      formTemplateId: body.formTemplateId,
      applicationPipelineId: body.applicationPipelineId ?? null,
      brandKey: body.brandKey ?? null,
      locationKey: body.locationKey ?? null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
