import { prisma } from "../src/lib/prisma";
import { pullLast7DaysClosedOrders } from "../src/server/services/invu/invuClosedOrdersService";

async function main() {
  const cred = await prisma.invuIntegrationCredential.findFirst({
    where: { status: "CONNECTED" },
    include: { venue: true },
  });
  if (!cred?.venue) {
    console.error("No CONNECTED INVU credential found.");
    return;
  }
  console.log(`Pulling last 7 days for ${cred.venue.slug}…`);
  const r = await pullLast7DaysClosedOrders({ venueId: cred.venue.id });
  console.log(`Sync run: ${r.syncRunId}`);

  const run = await prisma.integrationSyncRun.findUnique({
    where: { id: r.syncRunId },
    select: { status: true, ordersPulledCount: true, matchedCount: true, unmatchedCount: true, errorCount: true, summaryJson: true },
  });
  console.log("Result:", run);

  const tsCount = await prisma.tableSession.count({ where: { venueId: cred.venue.id } });
  console.log(`TableSessions in DB: ${tsCount}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
