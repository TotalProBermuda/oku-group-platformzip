import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApplicationStatus } from "@prisma/client";
import { canTransition } from "@/lib/hiring/transitions";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const toStatus = body.toStatus as ApplicationStatus;
  const reason = body.reason ?? null;

  const app = await prisma.applicationSubmission.findUnique({ where: { id } });

  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (!canTransition(app.status, toStatus)) {
    return NextResponse.json(
      { error: `Invalid transition from ${app.status} to ${toStatus}` },
      { status: 400 }
    );
  }

  const updated = await prisma.applicationSubmission.update({
    where: { id },
    data: {
      status: toStatus,
      reviewedAt: new Date(),
      workflowEvents: {
        create: [
          {
            type: "STATUS_CHANGE",
            payloadJson: { from: app.status, to: toStatus, reason },
          },
        ],
      },
      stageTransitions: {
        create: [
          {
            fromStatus: app.status,
            toStatus,
            reason,
          },
        ],
      },
    },
  });

  return NextResponse.json(updated);
}
