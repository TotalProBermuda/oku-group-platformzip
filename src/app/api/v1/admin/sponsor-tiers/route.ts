import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(req: Request) {
  await requireAdminRoles(req, ["SUPERADMIN"]);

  const tiers = await prisma.sponsorTier.findMany({
    orderBy: { displayOrder: "asc" },
  });
  return NextResponse.json({ tiers });
}

export async function POST(req: Request) {
  await requireAdminRoles(req, ["SUPERADMIN"]);

  const body = await req.json();
  const tier = await prisma.sponsorTier.create({
    data: {
      key: body.key,
      label: body.label,
      displayOrder: body.displayOrder ?? 0,
      description: body.description ?? null,
    },
  });
  return NextResponse.json({ tier }, { status: 201 });
}
