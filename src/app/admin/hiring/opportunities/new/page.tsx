import { prisma } from "@/lib/prisma";
import OpportunityForm from "@/components/hiring/OpportunityForm";

export default async function NewOpportunityPage() {
  const [templates, pipelines] = await Promise.all([
    prisma.formTemplate.findMany({
      where: { status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.applicationPipeline.findMany({
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h2 className="section-title">New Opportunity</h2>
        <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginTop: 4 }}>
          Create a new hiring opportunity linked to a form template.
        </p>
      </div>

      <div className="card" style={{ padding: "28px 24px", maxWidth: 640 }}>
        <OpportunityForm templates={templates} pipelines={pipelines} />
      </div>
    </>
  );
}
