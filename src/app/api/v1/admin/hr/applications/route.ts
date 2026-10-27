import { NextResponse } from "next/server";
import { z } from "zod/v3";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "hr:read");

    const applications = await prisma.jobApplication.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { id: true, title: true, department: true } },
      },
    });

    return NextResponse.json({ ok: true, data: applications });
  } catch (error: unknown) {
    const details = getAdminApiErrorDetails(error);
    return NextResponse.json({ ok: false, error: details.message }, { status: details.status });
  }
}

const PatchBody = z.object({
  applicationId: z.string(),
  stage: z.enum(["NEW", "REVIEW", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]),
});

export async function PATCH(req: Request) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "hr:write");

    const body = PatchBody.parse(await req.json());
    const updated = await prisma.jobApplication.update({
      where: { id: body.applicationId },
      data: { stage: body.stage },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error: unknown) {
    const details = getAdminApiErrorDetails(error);
    return NextResponse.json({ ok: false, error: details.message }, { status: details.status });
  }
}
