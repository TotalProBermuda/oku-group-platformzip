import { prisma } from "@/lib/prisma";
import { hostRoles, modes, sponsorValue } from "./sessionFields";

export async function effectiveSeriesHosts(seriesId: string) {
  const series = await prisma.series.findUnique({ where: { id: seriesId }, include: { seriesHosts: { include: { entity: { include: { linkedInfluencerProfile: true } } } } } });
  if (!series) return [];
  const defaults = modes(series.sessionDefaults);
  const entities = await prisma.entity.findMany({ include: { linkedInfluencerProfile: true } });
  return hostRoles.flatMap(role => {
    const edit = defaults[`hosts.${role}`];
    const legacy = series.seriesHosts.filter(h => h.role === role);
    if (!edit || edit.mode === "inherit") return legacy;
    const ids = edit.mode === "clear" ? [] : edit.value as string[];
    return ids.flatMap((id, sortOrder) => {
      const entity = entities.find(e => e.id === id);
      if (!entity) return [];
      return [{ id: `default-${role}-${id}`, seriesId, entityId: id, role, isFrontFacing: true, commissionShareBps: null, sortOrder, createdAt: series.createdAt, entity }];
    });
  });
}
const includeSponsors = { tier: true, entity: { select: { id: true, displayName: true, logoUrl: true, websiteUrl: true } } } as const;
export async function effectiveSeriesSponsors(seriesId: string) {
  const [series, legacy] = await Promise.all([
    prisma.series.findUnique({ where: { id: seriesId }, select: { sessionDefaults: true } }),
    prisma.sponsorAssignment.findMany({ where: { scopeType: "SERIES", scopeId: seriesId, isActive: true }, include: includeSponsors, orderBy: [{ tier: { displayOrder: "asc" } }, { sortOrder: "asc" }] }),
  ]);
  const edit = modes(series?.sessionDefaults).sponsors;
  if (!edit || edit.mode === "inherit") return legacy;
  const values = edit.mode === "clear" ? [] : sponsorValue.parse(edit.value);
  const [entities, tiers] = await Promise.all([
    prisma.entity.findMany({ where: { id: { in: values.map(s => s.entityId) } }, select: includeSponsors.entity.select }),
    prisma.sponsorTier.findMany({ where: { id: { in: values.map(s => s.tierId) } } }),
  ]);
  return values.flatMap((s, sortOrder) => {
    const entity = entities.find(e => e.id === s.entityId), tier = tiers.find(t => t.id === s.tierId);
    if (!entity || !tier) return [];
    return [{ ...s, id: `default-${s.entityId}`, scopeType: "SERIES" as const, scopeId: seriesId, sortOrder, isActive: true,
      logoUrl: null, logoVariant: "FULL_COLOR" as const, displayNameOverride: null, websiteUrl: null, notes: null, createdByUserId: null,
      createdAt: new Date(0), updatedAt: new Date(0), entity, tier,
    }];
  });
}
