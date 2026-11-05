import { NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { z } from "zod/v3";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

const Body = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  visibility: z.enum(["PRIVATE", "APPROVED_INVESTORS"]).optional(),
});

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "ir:read");

    const docs = await prisma.iRDocument.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        versions: { orderBy: { version: "desc" } },
      },
    });

    return NextResponse.json({ ok: true, data: docs });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}

export async function POST(req: Request) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "ir:write");

    const body = Body.parse(await req.json());
    const doc = await prisma.iRDocument.create({
      data: {
        title: body.title,
        description: body.description,
        visibility: body.visibility || "APPROVED_INVESTORS",
      },
    });
    return NextResponse.json({ ok: true, data: doc });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
