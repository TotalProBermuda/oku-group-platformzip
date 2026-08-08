import { prisma } from "@/lib/prisma";

export async function recordIntegrationAudit(
  action: string,
  userId: string | null | undefined,
  credentialId: string | null | undefined,
  meta: Record<string, unknown> & { ip?: string; venueId?: string }
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: userId ?? "system",
      action,
      metadata: { credentialId, venueId: meta.venueId, ...meta },
      ip: meta.ip ?? null,
    },
  });
}
