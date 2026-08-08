/**
 * Sponsor Placement Engine — render service.
 * Resolves, sorts, filters, and groups sponsor assignments for each surface.
 */

export type SponsorSurface = "event_page" | "ticket" | "email" | "check_in";

export interface SponsorTierVM {
  tierId: string;
  tierKey: string;
  tierLabel: string;
  displayOrder: number;
  sponsors: SponsorVM[];
}

export interface SponsorVM {
  id: string;
  entityId: string;
  displayName: string;
  logoUrl: string | null;
  logoVariant: string;
  websiteUrl: string | null;
  sortOrder: number;
  isInherited: boolean;
}

export interface ResolvedSponsors {
  tiers: SponsorTierVM[];
  hasSponsors: boolean;
  inheritedCount: number;
  directCount: number;
}

/** Given raw assignments from the DB, produce grouped, ordered view models */
export function resolveSponsors(
  assignments: any[],
  surface: SponsorSurface,
  isInherited = false
): ResolvedSponsors {
  const surfaceKey = surfaceToField(surface);
  const filtered = assignments.filter((a) => a.isActive && a[surfaceKey]);

  const tierMap = new Map<string, SponsorTierVM>();

  for (const a of filtered) {
    const key = a.tier.id;
    if (!tierMap.has(key)) {
      tierMap.set(key, {
        tierId: a.tier.id,
        tierKey: a.tier.key,
        tierLabel: a.tier.label,
        displayOrder: a.tier.displayOrder,
        sponsors: [],
      });
    }
    tierMap.get(key)!.sponsors.push({
      id: a.id,
      entityId: a.entityId,
      displayName: a.displayNameOverride ?? a.entity?.displayName ?? "",
      logoUrl: a.logoUrl ?? a.entity?.logoUrl ?? null,
      logoVariant: a.logoVariant ?? "FULL_COLOR",
      websiteUrl: a.websiteUrl ?? a.entity?.websiteUrl ?? null,
      sortOrder: a.sortOrder,
      isInherited,
    });
  }

  // Sort sponsors within each tier
  for (const tier of tierMap.values()) {
    tier.sponsors.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const tiers = Array.from(tierMap.values()).sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  return {
    tiers,
    hasSponsors: tiers.some((t) => t.sponsors.length > 0),
    inheritedCount: isInherited ? filtered.length : 0,
    directCount: isInherited ? 0 : filtered.length,
  };
}

/** Merge series-level + event-level assignments for an event */
export function mergeSponsors(
  seriesAssignments: any[],
  eventAssignments: any[],
  surface: SponsorSurface
): ResolvedSponsors {
  const inherited = resolveSponsors(seriesAssignments, surface, true);
  const direct = resolveSponsors(eventAssignments, surface, false);

  const tierMap = new Map<string, SponsorTierVM>();

  const mergeTiers = (tiers: SponsorTierVM[], isInh: boolean) => {
    for (const tier of tiers) {
      if (!tierMap.has(tier.tierId)) {
        tierMap.set(tier.tierId, { ...tier, sponsors: [] });
      }
      for (const s of tier.sponsors) {
        tierMap.get(tier.tierId)!.sponsors.push({ ...s, isInherited: isInh });
      }
    }
  };

  mergeTiers(inherited.tiers, true);
  mergeTiers(direct.tiers, false);

  // Deduplicate by entityId within tier (direct wins over inherited)
  for (const tier of tierMap.values()) {
    const seen = new Set<string>();
    tier.sponsors = tier.sponsors.filter((s) => {
      if (seen.has(s.entityId)) return false;
      seen.add(s.entityId);
      return true;
    });
    tier.sponsors.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const tiers = Array.from(tierMap.values())
    .filter((t) => t.sponsors.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    tiers,
    hasSponsors: tiers.length > 0,
    inheritedCount: inherited.directCount + inherited.inheritedCount,
    directCount: direct.directCount,
  };
}

function surfaceToField(surface: SponsorSurface): string {
  switch (surface) {
    case "event_page": return "showOnEventPage";
    case "ticket":     return "showOnTicket";
    case "email":      return "showOnEmail";
    case "check_in":   return "showOnCheckInView";
  }
}

/** Max logo heights (px) by tier key and surface */
export const LOGO_HEIGHTS: Record<string, Record<string, { desktop: number; mobile: number }>> = {
  PRESENTED_BY:     { event_page: { desktop: 64, mobile: 44 }, ticket: { desktop: 48, mobile: 36 }, email: { desktop: 52, mobile: 40 }, check_in: { desktop: 48, mobile: 36 } },
  HOSTED_WITH:      { event_page: { desktop: 48, mobile: 36 }, ticket: { desktop: 36, mobile: 28 }, email: { desktop: 40, mobile: 32 }, check_in: { desktop: 36, mobile: 28 } },
  PARTNER:          { event_page: { desktop: 32, mobile: 24 }, ticket: { desktop: 26, mobile: 20 }, email: { desktop: 28, mobile: 22 }, check_in: { desktop: 28, mobile: 22 } },
  SUPPORTING_PARTNER: { event_page: { desktop: 24, mobile: 18 }, ticket: { desktop: 20, mobile: 16 }, email: { desktop: 22, mobile: 18 }, check_in: { desktop: 20, mobile: 16 } },
};

export function getLogoHeight(tierKey: string, surface: SponsorSurface, mobile = false): number {
  const h = LOGO_HEIGHTS[tierKey]?.[surface];
  if (!h) return mobile ? 24 : 32;
  return mobile ? h.mobile : h.desktop;
}
