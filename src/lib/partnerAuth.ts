import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { getActiveAccessForUser } from "@/server/partnerSeats/service";

export class PartnerAuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export interface PartnerSeriesAuthResult {
  userId: string;
  partnerProfileId: string | null;
  isSuperadmin: boolean;
  series: {
    id: string;
    title: string;
    partnerId: string | null;
    slug: string;
    status: string;
    partnerShareBps: number | null;
  };
  /** True when caller is the series partner (or superadmin). */
  isSeriesPartner: boolean;
  /** Set of session IDs on this series where caller is a CO_HOST entity. */
  coHostSessionIds: Set<string>;
  /** Set of session IDs on this series accessible via PartnerDelegateSeat (session-scoped). */
  delegateSessionIds: Set<string>;
  /** True when caller has a series-scoped delegate seat on this series. */
  isSeriesDelegate: boolean;
}

export async function requirePartnerForSeries(seriesId: string): Promise<PartnerSeriesAuthResult> {
  const { userId, roles } = await requireSession();
  const isSuperadmin = roles.includes("SUPERADMIN");
  const isPartnerRole = roles.includes("PARTNER");

  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { id: true, title: true, partnerId: true, slug: true, status: true, partnerShareBps: true },
  });
  if (!series) throw new PartnerAuthError("Series not found", 404);

  const profile = await prisma.partnerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  const isSeriesPartner = isSuperadmin || (!!profile && series.partnerId === profile.id);

  // Resolve sessions on this series where caller is a CO_HOST (legacy path).
  let coHostSessionIds = new Set<string>();
  let delegateSessionIds = new Set<string>();
  let isSeriesDelegate = false;

  if (!isSeriesPartner) {
    // Active delegate seat grants for this series.
    // A grant is "series-wide" only when sessionId is null AND seriesId matches
    // (a session-scoped grant must NOT escalate to series-wide access).
    const grants = await getActiveAccessForUser(userId, { seriesId });
    for (const g of grants) {
      if (g.sessionId == null && g.seriesId === seriesId) {
        isSeriesDelegate = true;
      } else if (g.sessionId && g.session?.seriesId === seriesId) {
        delegateSessionIds.add(g.sessionId);
      }
    }

    if (!isSeriesDelegate) {
      const eventHosts = await prisma.eventHost.findMany({
        where: {
          role: "CO_HOST",
          entity: { linkedUserId: userId },
          session: { seriesId },
        },
        select: { sessionId: true },
      });
      coHostSessionIds = new Set(eventHosts.map((h) => h.sessionId));

      if (
        coHostSessionIds.size === 0 &&
        delegateSessionIds.size === 0 &&
        !isPartnerRole
      ) {
        throw new PartnerAuthError("Forbidden");
      }
      // Caller must have at least one access path to this series.
      if (coHostSessionIds.size === 0 && delegateSessionIds.size === 0) {
        throw new PartnerAuthError("Forbidden");
      }
    }
  }

  return {
    userId,
    partnerProfileId: profile?.id ?? null,
    isSuperadmin,
    series,
    isSeriesPartner,
    coHostSessionIds,
    delegateSessionIds,
    isSeriesDelegate,
  };
}

/** True when caller has full series-wide access (partner, superadmin, or series-scoped delegate). */
export function hasFullSeriesAccess(auth: PartnerSeriesAuthResult): boolean {
  return auth.isSeriesPartner || auth.isSeriesDelegate;
}

/** Union of session-scoped access paths (legacy CO_HOST + delegate seats). Empty when caller has full access. */
export function accessibleSessionIds(auth: PartnerSeriesAuthResult): Set<string> {
  if (hasFullSeriesAccess(auth)) return new Set();
  const out = new Set<string>(auth.coHostSessionIds);
  for (const id of auth.delegateSessionIds) out.add(id);
  return out;
}

/** Authorize a single session within a series. Co-leads are scoped to their session(s). */
export async function requirePartnerForSession(seriesId: string, sessionId: string) {
  const auth = await requirePartnerForSeries(seriesId);
  if (
    !auth.isSeriesPartner &&
    !auth.isSeriesDelegate &&
    !auth.coHostSessionIds.has(sessionId) &&
    !auth.delegateSessionIds.has(sessionId)
  ) {
    throw new PartnerAuthError("Forbidden");
  }
  return auth;
}

/**
 * Stricter check used by seat-management endpoints — only the actual partner
 * (or superadmin) may invite, revoke, or remove delegate seats.
 */
export async function requireSeriesPartnerOnly(seriesId: string) {
  const auth = await requirePartnerForSeries(seriesId);
  if (!auth.isSeriesPartner) throw new PartnerAuthError("Forbidden");
  return auth;
}
