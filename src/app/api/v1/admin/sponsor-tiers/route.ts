import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tiers = await prisma.sponsorTier.findMany({
    orderBy: { displayOrder: "asc" },
  });
  return NextResponse.json({ tiers });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
