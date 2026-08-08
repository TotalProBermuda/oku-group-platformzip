import { NextRequest, NextResponse } from "next/server";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const auth = await getOptionalSession();
  const body = await req.json().catch(() => ({}));

  const { fullName, email, phone, company, roleTitle, reasonForInterest } = body;

  if (!fullName || !email || !reasonForInterest) {
    return NextResponse.json({ error: "Full name, email, and reason are required" }, { status: 400 });
  }

  if (auth) {
    const existing = await prisma.founderMembershipApplication.findFirst({
      where: { userId: auth.userId, status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] } },
    });
    if (existing) {
      return NextResponse.json({ error: "You already have a pending or approved Founder application", status: existing.status }, { status: 409 });
    }
  }

  const application = await prisma.founderMembershipApplication.create({
    data: {
      userId: auth?.userId ?? null,
      fullName,
      email,
      phone: phone || null,
      company: company || null,
      roleTitle: roleTitle || null,
      reasonForInterest,
      status: "SUBMITTED",
    },
  });

  return NextResponse.json({ success: true, applicationId: application.id, status: application.status }, { status: 201 });
}
