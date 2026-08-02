import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
