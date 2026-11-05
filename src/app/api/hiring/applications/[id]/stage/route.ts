import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { z } from "zod/v3";

const StageBody = z.object({ status: z.enum([
  "DRAFT", "SUBMITTED", "UNDER_REVIEW", "HR_SCREEN", "MANAGER_REVIEW",
  "INTERVIEW_SCHEDULED", "TRIAL_SHIFT", "OFFER_PENDING", "HIRED", "REJECTED", "WITHDRAWN", "ARCHIVED",
]) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const parsedBody = StageBody.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }
    const { status } = parsedBody.data;

    const submission = await prisma.applicationSubmission.findUnique({ where: { id } });
    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.applicationSubmission.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });

    // Log the transition
    await prisma.applicationWorkflowEvent.create({
      data: {
        applicationId: id,
        type: "STATUS_CHANGE",
        actorId: session.user.id ?? null,
        payloadJson: { from: submission.status, to: status },
      },
    });

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (err) {
    console.error("[PATCH /api/hiring/applications/[id]/stage]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
