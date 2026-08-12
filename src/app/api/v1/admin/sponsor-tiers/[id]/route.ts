import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdminRoles(req, ["SUPERADMIN"]);

  const { id } = await params;
  const body = await req.json();
  const tier = await prisma.sponsorTier.update({
    where: { id },
    data: {
      label: body.label,
      displayOrder: body.displayOrder,
      description: body.description,
      isActive: body.isActive,
    },
  });
  return NextResponse.json({ tier });
}
