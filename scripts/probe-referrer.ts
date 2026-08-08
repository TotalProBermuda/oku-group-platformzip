import { prisma } from "../src/lib/prisma";

async function main() {
  const referrers = await prisma.referrer.findMany({
    include: {
      user: true,
      _count: { select: { attributions: true, commissions: true } },
    },
  });
  const ranked = referrers
    .map(r => ({
      name: r.fullName,
      email: r.user?.email,
      atts: r._count.attributions,
      comms: r._count.commissions,
    }))
    .sort((a, b) => (b.atts + b.comms) - (a.atts + a.comms));
  console.log("Top 10 referrers by activity:");
  for (const x of ranked.slice(0, 10)) console.log(JSON.stringify(x));

  const top = referrers.find(r => r.user?.email === ranked[0].email);
  if (!top) return;
  console.log("\nDetail for", top.fullName, "—", top.user?.email);
  const atts = await prisma.reservationAttribution.findMany({
    where: { referrerId: top.id },
    include: { reservation: { include: { tableSessions: true, guestProfile: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  for (const a of atts) {
    console.log("- guest:", a.reservation?.guestProfile?.fullName ?? a.reservation?.contactName,
      "| status:", a.reservation?.status, "| stage:", a.conversionStage,
      "| ts:", a.reservation?.tableSessions.length,
      "| netRev:", a.reservation?.tableSessions.map(t => t.netRevenueCents).join(","));
  }
  const comms = await prisma.commissionEntry.findMany({
    where: { referrerId: top.id }, take: 6, orderBy: { createdAt: "desc" },
  });
  for (const c of comms) console.log("- comm:", c.amountCents, c.status, "resId:", c.reservationId);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
