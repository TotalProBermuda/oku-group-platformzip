import { sessionProductEnabled } from "@/server/commerce/sessionProducts";

type SaleDate = string | Date;
export type PurchaseSession = {
  id: string; status: string; startsAt: SaleDate; endsAt: SaleDate;
  allowLateSales?: boolean; capacity: number; soldCount: number; fieldModes?: unknown;
};
export type PurchaseTicket = {
  id: string; ticketStatus: string; saleStartsAt?: SaleDate | null; saleEndsAt?: SaleDate | null;
  visibilityMode?: string; typeCapacity?: number | null; soldCount?: number;
  minPerOrder?: number; maxPerOrder?: number;
};
export type PurchaseSeries = {
  status: string; sessionDefaults?: unknown; ticketTypes: PurchaseTicket[];
};
export type PublicPurchaseSeries = PurchaseSeries & { slug: string; sessions: PurchaseSession[] };

/** Presentation guard only. Mirrors catalogPolicy/quote timing and product rules;
 * checkout remains authoritative for access, live inventory and payment. */
export function sessionTicketsOnSale(
  session: PurchaseSession | null | undefined,
  series: PurchaseSeries | null | undefined,
  now = Date.now(),
): boolean {
  if (!session || !series || series.status !== "PUBLISHED" || session.status !== "SCHEDULED") return false;
  const startsAt = new Date(session.startsAt).getTime();
  const endsAt = new Date(session.endsAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= now
    || (startsAt <= now && session.allowLateSales !== true)) return false;
  return series.ticketTypes.some(ticket => {
    const minimum = Math.max(1, ticket.minPerOrder ?? 1);
    if (ticket.ticketStatus !== "ACTIVE" || ticket.visibilityMode === "HIDDEN"
      || !sessionProductEnabled(session, series, ticket.id)
      || !(session.capacity - session.soldCount >= minimum)
      || (ticket.maxPerOrder !== undefined && ticket.maxPerOrder < minimum)
      || (ticket.typeCapacity != null && !(ticket.typeCapacity - (ticket.soldCount ?? 0) >= minimum))) return false;
    // Invalid/missing eligibility cannot enable a purchase action.
    if (ticket.saleStartsAt && !(new Date(ticket.saleStartsAt).getTime() <= now)) return false;
    if (ticket.saleEndsAt && !(new Date(ticket.saleEndsAt).getTime() >= now)) return false;
    return true;
  });
}

/** Next time a rendered link may change eligibility, including inclusive ticket
 * saleEndsAt (checkout closes it only once now > saleEndsAt). */
export function nextPurchaseBoundary(session?: PurchaseSession | null, series?: PurchaseSeries | null, now = Date.now()) {
  const dates = [
    session?.startsAt, session?.endsAt,
    ...(series?.ticketTypes.flatMap(ticket => [
      ticket.saleStartsAt, ticket.saleEndsAt ? new Date(new Date(ticket.saleEndsAt).getTime() + 1) : null,
    ]) ?? []),
  ].filter((date): date is SaleDate => date != null).map(date => new Date(date).getTime()).filter(time => time > now);
  return dates.length ? Math.min(...dates) : null;
}

/** Calendar rows intentionally lack sale fields. Read the existing untruncated,
 * sale-filtered catalog per slug, never substitute its first eligible session. */
export async function loadCalendarPurchaseSeries(slugs: string[], locale: string) {
  const entries = await Promise.all([...new Set(slugs)].map(async slug => {
    try {
      const response = await fetch(`/api/v1/experiences?slug=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`);
      if (!response.ok) throw new Error("Unable to load ticket availability");
      const data: { series?: PublicPurchaseSeries[] } = await response.json();
      const series = data.series?.find(candidate => candidate.slug === slug);
      return series ? [[slug, series] as const] : [];
    } catch {
      console.error(`Unable to load ticket availability for ${slug}`);
      return []; // Fail closed for purchases; calendar event navigation remains available.
    }
  }));
  return Object.fromEntries(entries.flat()) as Record<string, PublicPurchaseSeries>;
}
