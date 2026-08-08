import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAnswers } from "@/lib/hiring/validation";
import { normalizeSubmission } from "@/lib/hiring/normalization";
import { FormSchema, ValidationRuleMap } from "@/lib/hiring/types";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const draft = await prisma.applicationDraft.findUnique({
    where: { id },
    include: {
      formTemplate: true,
      opportunity: true,
    },
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const schema = draft.formTemplate.schemaJson as unknown as FormSchema;
  const rules = draft.formTemplate.validationJson as unknown as ValidationRuleMap;
  const answers = (draft.answersJson ?? {}) as Record<string, unknown>;

  const errors = validateAnswers(schema, rules, answers);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const fullName =
    typeof answers.full_name === "string" ? answers.full_name : "Unknown Applicant";
  const email =
    typeof answers.email === "string"
      ? answers.email
      : `unknown-${Date.now()}@example.com`;
  const phone = typeof answers.phone === "string" ? answers.phone : null;

  const profile = await prisma.applicantProfile.create({
    data: {
      fullName,
      email,
      phone,
      workAuthorizationStatus:
        typeof answers.work_permit_status === "string"
          ? answers.work_permit_status
          : null,
      dataConsentAt: new Date(),
    },
  });

  const normalized = normalizeSubmission(answers);

  const submission = await prisma.applicationSubmission.create({
    data: {
      opportunityId: draft.opportunityId,
      formTemplateId: draft.formTemplateId,
      applicantProfileId: profile.id,
      applicantType: "INDIVIDUAL",
      status: "SUBMITTED",
      source: draft.source ?? "manual",
      templateVersion: draft.templateVersion,
      submissionDataJson: answers as never,
      normalizedSnapshotJson: normalized as never,
      submittedAt: new Date(),
      workflowEvents: {
        create: [
          {
            type: "SYSTEM",
            payloadJson: { message: "Application submitted from draft" },
          },
        ],
      },
      stageTransitions: {
        create: [
          {
            fromStatus: "DRAFT",
            toStatus: "SUBMITTED",
            reason: "Applicant submitted application",
          },
        ],
      },
    },
    include: {
      opportunity: true,
      applicantProfile: true,
    },
  });

  await prisma.applicationDraft.update({
    where: { id: draft.id },
    data: {
      applicantProfileId: profile.id,
      status: "SUBMITTED",
    },
  });

  return NextResponse.json(submission, { status: 201 });
}
