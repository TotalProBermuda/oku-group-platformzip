import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { validateAnswers } from "@/lib/hiring/validation";
import { normalizeSubmission } from "@/lib/hiring/normalization";
import { FormSchema, ValidationRuleMap } from "@/lib/hiring/types";
import DynamicFormRenderer from "@/components/hiring/DynamicFormRenderer";

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ draftId?: string }>;
}) {
  const { slug } = await params;
  const { draftId } = await searchParams;

  const opportunity = await prisma.opportunity.findUnique({
    where: { slug },
    include: { formTemplate: true },
  });

  if (!opportunity || opportunity.status !== "PUBLISHED") notFound();

  if (!opportunity.formTemplate) {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 400, marginBottom: 12 }}>
            Application Not Yet Available
          </h2>
          <p style={{ fontSize: 15, color: "var(--color-text-muted)", marginBottom: 24 }}>
            The application form for this role is not ready yet. Please check back soon or contact us directly.
          </p>
          <Link href={`/careers/${slug}`} className="btn btn-ghost">← Back to Role</Link>
        </div>
      </main>
    );
  }

  let existingDraft = null;
  if (draftId) {
    existingDraft = await prisma.applicationDraft.findUnique({ where: { id: draftId } });
  }

  const opp = opportunity;

  // ── Server action: save draft ──────────────────────────────────────────────
  async function saveDraft(values: Record<string, unknown>) {
    "use server";

    if (existingDraft) {
      await prisma.applicationDraft.update({
        where: { id: existingDraft.id },
        data: { answersJson: values },
      });
      return;
    }

    const created = await prisma.applicationDraft.create({
      data: {
        opportunityId: opp.id,
        formTemplateId: opp.formTemplateId!,
        source: "manual",
        templateVersion: opp.formTemplate!.version,
        answersJson: values,
      },
    });

    redirect(`/careers/${slug}/apply?draftId=${created.id}`);
  }

  // ── Server action: submit ──────────────────────────────────────────────────
  async function submit(values: Record<string, unknown>) {
    "use server";

    // 1. Create or update the draft
    let draft = existingDraft;
    if (!draft) {
      draft = await prisma.applicationDraft.create({
        data: {
          opportunityId: opp.id,
          formTemplateId: opp.formTemplateId!,
          source: "manual",
          templateVersion: opp.formTemplate!.version,
          answersJson: values,
        },
      });
    } else {
      await prisma.applicationDraft.update({
        where: { id: draft.id },
        data: { answersJson: values },
      });
    }

    // 2. Server-side validation
    const schema = opp.formTemplate!.schemaJson as unknown as FormSchema;
    const rules  = opp.formTemplate!.validationJson as unknown as ValidationRuleMap;
    const errors = validateAnswers(schema, rules, values);
    if (Object.keys(errors).length > 0) {
      return { errors };
    }

    // 3. Create applicant profile
    const fullName = typeof values.full_name === "string" ? values.full_name : "Unknown Applicant";
    const email    = typeof values.email    === "string" ? values.email : `anon-${Date.now()}@apply.oku`;
    const phone    = typeof values.phone    === "string" ? values.phone : null;

    const profile = await prisma.applicantProfile.create({
      data: {
        fullName,
        email,
        phone,
        workAuthorizationStatus: typeof values.work_permit_status === "string" ? values.work_permit_status : null,
        dataConsentAt: new Date(),
      },
    });

    // 4. Normalize + create submission
    const normalized = normalizeSubmission(values);

    await prisma.applicationSubmission.create({
      data: {
        opportunityId:      opp.id,
        formTemplateId:     opp.formTemplateId!,
        applicantProfileId: profile.id,
        applicantType:      "INDIVIDUAL",
        status:             "SUBMITTED",
        source:             draft.source ?? "manual",
        templateVersion:    draft.templateVersion,
        submissionDataJson: values as never,
        normalizedSnapshotJson: normalized as never,
        submittedAt:        new Date(),
        workflowEvents: {
          create: [{ type: "SYSTEM", payloadJson: { message: "Application submitted by applicant" } }],
        },
        stageTransitions: {
          create: [{ fromStatus: "DRAFT", toStatus: "SUBMITTED", reason: "Applicant submitted application" }],
        },
      },
    });

    // 5. Mark draft as submitted
    await prisma.applicationDraft.update({
      where: { id: draft.id },
      data: { applicantProfileId: profile.id, status: "SUBMITTED" },
    });

    redirect(`/careers/${slug}/apply/success`);
  }

  return (
    <main>
      <section style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-border)", padding: "48px 24px 36px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <Link
            href={`/careers/${slug}`}
            style={{ fontSize: 13, color: "var(--color-text-muted)", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, textDecoration: "none" }}
          >
            ← {opportunity.title}
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {opportunity.department && (
              <span className="badge badge-neutral">{opportunity.department}</span>
            )}
            {opportunity.locationKey && (
              <span className="badge badge-neutral">{opportunity.locationKey}</span>
            )}
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 400, letterSpacing: "-0.02em", color: "var(--color-text)", margin: "0 0 8px" }}>
            Apply — {opportunity.title}
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>
            Complete all sections below. You can save your progress and return at any time.
            {existingDraft && (
              <span style={{ marginLeft: 8, color: "var(--color-crimson)", fontWeight: 500 }}>✓ Draft restored</span>
            )}
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px" }}>
        <DynamicFormRenderer
          schema={opportunity.formTemplate.schemaJson as { sections: Parameters<typeof DynamicFormRenderer>[0]["schema"]["sections"] }}
          initialValues={(existingDraft?.answersJson ?? {}) as Record<string, unknown>}
          onSaveDraft={saveDraft}
          onSubmit={submit}
        />
      </section>
    </main>
  );
}
