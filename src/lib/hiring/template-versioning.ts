import { prisma } from "@/lib/prisma";

export async function publishTemplate(templateId: string) {
  const template = await prisma.formTemplate.findUnique({
    where: { id: templateId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!template) throw new Error("Template not found");

  const nextVersion = (template.versions[0]?.versionNumber ?? 0) + 1;

  const version = await prisma.formTemplateVersion.create({
    data: {
      formTemplateId: templateId,
      versionNumber: nextVersion,
      schemaJson: template.schemaJson as never,
      uiSchemaJson: (template.uiSchemaJson ?? undefined) as never,
      validationJson: (template.validationJson ?? undefined) as never,
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  await prisma.formTemplate.update({
    where: { id: templateId },
    data: {
      status: "PUBLISHED",
      version: nextVersion,
    },
  });

  return version;
}

export async function saveTemplateDraft(
  templateId: string,
  schemaJson: unknown,
  uiSchemaJson?: unknown,
  validationJson?: unknown
) {
  return prisma.formTemplate.update({
    where: { id: templateId },
    data: {
      schemaJson: schemaJson as never,
      uiSchemaJson: (uiSchemaJson ?? undefined) as never,
      validationJson: (validationJson ?? undefined) as never,
    },
  });
}
