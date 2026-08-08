import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import FormBuilder from "@/components/hiring/builder/FormBuilder";
import { BuilderTemplate } from "@/lib/hiring/builderTypes";
import { normalizeSchema } from "@/lib/hiring/field-factory";
import AdminPageShell from "@/components/admin/AdminPageShell";

export const dynamic = "force-dynamic";

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const template = await prisma.formTemplate.findUnique({
    where: { id },
  });

  if (!template) notFound();

  const normalized = normalizeSchema(template.schemaJson);

  const initialTemplate: BuilderTemplate = {
    id: template.id,
    name: template.name,
    slug: template.slug,
    category: template.category ?? "employment",
    status: template.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    version: template.version,
    sections: normalized.sections as BuilderTemplate["sections"],
  };

  return (
    <AdminPageShell
      eyebrow="Hiring · Template Editor"
      title={template.name}
      subtitle="Build and edit the application form schema."
    >
      <div style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>
        <FormBuilder initialTemplate={initialTemplate} />
      </div>
    </AdminPageShell>
  );
}
