import { prisma } from "@/lib/prisma";
import { resolveDateRange, type DateRangeInput } from "@/lib/analytics/dateFilters";

export async function getZoneScorecards(venueId: string, range?: DateRangeInput) {
  const { from, to } = resolveDateRange(range);

  const zones = await prisma.zone.findMany({
    where: { venueId },
    orderBy: { sortOrder: "asc" },
  });

  const attributions = await prisma.reservationAttribution.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      reservation: { venueId },
    },
    include: {
      reservation: { select: { zoneId: true, partySize: true, conceptRequested: true } },
    },
  });

  const scorecards = zones.map((zone) => {
    const zoneAttrs = attributions.filter(
      (a) => a.reservation.zoneId === zone.id || a.reservation.conceptRequested === zone.conceptKey
    );

    const initiated = zoneAttrs.length;
    const arrived = zoneAttrs.filter(a => ["ARRIVED", "OFFERED", "PATRONIZED"].includes(a.conversionStage)).length;
    const patronized = zoneAttrs.filter(a => a.conversionStage === "PATRONIZED").length;
    const lost = zoneAttrs.filter(a => a.conversionStage === "LOST").length;
    const conversionRate = arrived > 0 ? Math.round((patronized / arrived) * 100) : 0;

    const lossReasonCounts: Record<string, number> = {};
    zoneAttrs.filter(a => a.lossReason).forEach(a => {
      if (a.lossReason) {
        lossReasonCounts[a.lossReason] = (lossReasonCounts[a.lossReason] ?? 0) + 1;
      }
    });

    const topLossReasons = Object.entries(lossReasonCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    const operationalLosses = zoneAttrs.filter(a =>
      a.lossReason && ["PREFERRED_SEATING_UNAVAILABLE", "TERRACE_UNAVAILABLE", "WAIT_TOO_LONG", "TABLE_NOT_READY", "ELEVATOR_NOT_WORKING", "NOT_ENOUGH_SEATS"].includes(a.lossReason)
    ).length;

    return {
      zone,
      metrics: { initiated, arrived, patronized, lost, conversionRate, operationalLosses },
      topLossReasons,
    };
  });

  return scorecards;
}
