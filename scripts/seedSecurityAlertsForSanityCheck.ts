/**
 * DEV / SANITY UTILITY — NOT FOR PRODUCTION.
 *
 * One-off seeder for /admin/security visual verification. Lets an operator
 * rehearse the security-alert dashboard without waiting for real anomalies.
 *
 *   tsx scripts/seedSecurityAlertsForSanityCheck.ts        # seed 6 demo alerts
 *   tsx scripts/seedSecurityAlertsForSanityCheck.ts clean  # remove seeded rows
 *
 * Each row is tagged `metadata.__sanityCheck: true` so cleanup is precise
 * and won't touch real `audit.anomaly.alert` rows produced by the scanner.
 *
 * This script is intentionally NOT wired into `npm run seed`, the demo seed,
 * the worker boot path, or any production startup flow. It is run by hand
 * during development only. The guard below refuses to run if NODE_ENV is
 * "production" so it can never be invoked by mistake against a live database.
 */
if (process.env.NODE_ENV === "production") {
  // eslint-disable-next-line no-console
  console.error(
    "Refusing to run seedSecurityAlertsForSanityCheck.ts with NODE_ENV=production. " +
      "This script is a dev/sanity utility only.",
  );
  process.exit(1);
}

import { prisma } from "../src/lib/prisma";

const TAG = "__sanityCheck";

async function seed(): Promise<void> {
  const now = Date.now();
  const fixtures = [
    {
      pattern: "E", severity: "critical",
      summary: "Beneficiary search returned bank-field values (RESTRICTED_COMPLIANCE). Should be impossible — treat as a confirmed indicator.",
      sourceAuditIds: ["sanity-row-e1"],
      details: { actorId: "u_sanity_search", at: new Date(now - 5 * 60_000).toISOString() },
    },
    {
      pattern: "C", severity: "critical",
      summary: "Actor u_sanity_rogue transitioned 6 beneficiaries to REJECTED/ON_HOLD in 24h (threshold 5). Possible account takeover or rogue admin.",
      sourceAuditIds: ["sanity-row-c1", "sanity-row-c2", "sanity-row-c3", "sanity-row-c4", "sanity-row-c5", "sanity-row-c6"],
      details: { actorId: "u_sanity_rogue", distinctBeneficiaries: 6, threshold: 5 },
    },
    {
      pattern: "B", severity: "critical",
      summary: "Active-gateway change was rejected for actor u_sanity_alice but then succeeded under a different actor (u_sanity_bob). Possible permission-escalation or insider workaround.",
      sourceAuditIds: ["sanity-row-b1", "sanity-row-b2"],
      details: { rejectedActor: "u_sanity_alice", succeededActor: "u_sanity_bob" },
    },
    {
      pattern: "A", severity: "warn",
      summary: "5 cybersource test-connection failures in the last hour (threshold 5). Possible credential/key compromise or vendor outage.",
      sourceAuditIds: ["sanity-row-a1", "sanity-row-a2", "sanity-row-a3", "sanity-row-a4", "sanity-row-a5"],
      details: { provider: "cybersource", count: 5, threshold: 5, distinctActors: 1 },
    },
    {
      pattern: "D", severity: "warn",
      summary: "Ticket export of 4200 rows by actor u_sanity_export (threshold 1000). Confirm legitimate business need.",
      sourceAuditIds: ["sanity-row-d1"],
      details: { actorId: "u_sanity_export", rowCount: 4200, threshold: 1000 },
    },
    {
      pattern: "F", severity: "warn",
      summary: "12 unauthenticated admin requests from IP 10.0.99.42 in 10m (threshold 10). Possible credential stuffing.",
      sourceAuditIds: ["sanity-row-f1"],
      details: { ip: "10.0.99.42", count: 12, threshold: 10 },
    },
  ];

  let created = 0;
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const ts = new Date(now - i * 7 * 60_000);
    await prisma.auditLog.create({
      data: {
        actorId: "system:audit-anomaly-scan",
        action: "audit.anomaly.alert",
        createdAt: ts,
        metadata: {
          [TAG]: true,
          signalKey: `${f.pattern}:sanity:${ts.getTime()}`,
          pattern: f.pattern,
          severity: f.severity,
          summary: f.summary,
          sourceAuditIds: f.sourceAuditIds,
          details: f.details,
          windowStart: new Date(ts.getTime() - 60 * 60_000).toISOString(),
          windowEnd: ts.toISOString(),
        },
      },
    });
    created++;
  }
  console.log(`seeded ${created} sanity-check alerts (tagged metadata.${TAG}=true)`);
}

async function clean(): Promise<void> {
  const result = await prisma.auditLog.deleteMany({
    where: {
      action: "audit.anomaly.alert",
      metadata: { path: [TAG], equals: true },
    },
  });
  console.log(`removed ${result.count} sanity-check alerts`);
}

const mode = process.argv[2];
(mode === "clean" ? clean() : seed())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
