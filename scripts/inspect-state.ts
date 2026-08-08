import { prisma } from "../src/lib/prisma";

async function main() {
  const v = await prisma.venue.findMany({ select: { id: true, slug: true, name: true } });
  console.log("VENUES:", JSON.stringify(v, null, 2));
  const m = await prisma.integrationBranchMapping.findMany({
    include: { credential: { select: { id: true, status: true, venueId: true } } },
  });
  console.log("MAPPINGS:", JSON.stringify(m, null, 2));
  const c = {
    venues: v.length,
    hosts: await prisma.restaurantHostProfile.count(),
    referrers: await prisma.referrer.count(),
    reservations: await prisma.reservation.count(),
    tableSessions: await prisma.tableSession.count(),
    invuRaw: await prisma.invuOrderRaw.count(),
    invuNorm: await prisma.invuOrderNormalized.count(),
    syncRuns: await prisma.integrationSyncRun.count(),
  };
  console.log("COUNTS:", c);
}
main().catch(console.error).finally(() => prisma.$disconnect());
