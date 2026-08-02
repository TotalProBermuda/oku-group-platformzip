import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

const Body = z.object({
  slug: z.string().min(3),
  title: z.string().min(3),
  hostType: z.enum(["OKU", "CATCH", "INFLUENCER", "PARTNER"]),
  venue: z.enum(["OKU", "CATCH"]).optional(),
  influencerId: z.string().optional(),
  partnerId: z.string().optional(),
  communityUrl: z.string().url().optional(),
});

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const series = await prisma.series.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sessions: { include: { _count: { select: { tickets: true } } } },
        ticketTypes: true,
        influencer: { include: { user: { select: { id: true, name: true, email: true } } } },
        partner: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    return NextResponse.json({ ok: true, data: series });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "series:read");

    const body = Body.parse(await req.json());
    const series = await prisma.series.create({ data: { ...body, status: "DRAFT" } as any });
    return NextResponse.json({ ok: true, data: series });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
