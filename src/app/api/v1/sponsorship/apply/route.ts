import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gatePublicPostAsync } from "@/server/rateLimit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const gate = await gatePublicPostAsync(req, body, "sponsorship-apply", { limit: 3, windowMs: 60_000 });
  if (!gate.ok) return gate.response as NextResponse;

  const {
    slotId, brandName, contactName, contactEmail, contactPhone,
    websiteUrl, brandStatement, campaignGoals, budgetCents,
  } = body;

  if (!brandName?.trim())    return NextResponse.json({ error: "brandName required" }, { status: 400 });
  if (!contactName?.trim())  return NextResponse.json({ error: "contactName required" }, { status: 400 });
  if (!contactEmail?.trim()) return NextResponse.json({ error: "contactEmail required" }, { status: 400 });

  const application = await prisma.sponsorApplication.create({
    data: {
      slotId:        slotId        || null,
      brandName:     brandName.trim(),
      contactName:   contactName.trim(),
      contactEmail:  contactEmail.trim().toLowerCase(),
      contactPhone:  contactPhone  || null,
      websiteUrl:    websiteUrl    || null,
      brandStatement: brandStatement || null,
      campaignGoals: campaignGoals  || null,
      budgetCents:   budgetCents    ?? null,
      status:        "PENDING",
    },
  });

  return NextResponse.json({ ok: true, applicationId: application.id }, { status: 201 });
}
