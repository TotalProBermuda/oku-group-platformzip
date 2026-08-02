import { prisma } from "@/lib/prisma";
import Link from "next/link";
import StatusChip from "@/components/ui/StatusChip";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { resolveEarnerScopesForReferrers } from "@/server/commissions/earnerScope";

export const dynamic = "force-dynamic";

type ReferrerRow = Awaited<ReturnType<typeof getReferrers>>[number];

async function getReferrers() {
  // Nested `commissions` include intentionally REMOVED — Prisma relation
  // includes can only filter by the legacy `referrerId` FK and would
  // silently UNDER-COUNT rows attributed via `referralActorId` alone.
  // We re-attach commissions below using a single OR-clause query
  // bucketed locally by referrer; see src/server/commissions/earnerScope.ts.
  const referrers = await prisma.referrer.findMany({
    where: { isActive: true },
    include: {
      compensationPlan: { select: { name: true, modelType: true } },
      attributions: { select: { conversionStage: true, coversAttributed: true } },
    },
    orderBy: { fullName: "asc" },
  });

  if (referrers.length === 0) {
    return referrers.map(r => ({ ...r, commissions: [] as Array<{ amountCents: number; status: string }> }));
  }

  const legacyIds = referrers.map(r => r.id);
  const scopeByReferrer = await resolveEarnerScopesForReferrers(legacyIds);
  const actorIds = Array.from(scopeByReferrer.values())
    .map(s => s.actorId)
    .filter((x): x is string => !!x);
  const actorIdToLegacy = new Map<string, string>();
  for (const [legacy, scope] of scopeByReferrer.entries()) {
    if (scope.actorId) actorIdToLegacy.set(scope.actorId, legacy);
  }

  const allCommissions = await prisma.commissionEntry.findMany({
    where: {
      OR: [
        { referrerId: { in: legacyIds } },
        ...(actorIds.length ? [{ referralActorId: { in: actorIds } }] : []),
      ],
    },
    select: { amountCents: true, status: true, referrerId: true, referralActorId: true },
  });

  const byReferrer = new Map<string, Array<{ amountCents: number; status: string }>>();
  for (const id of legacyIds) byReferrer.set(id, []);
  for (const c of allCommissions) {
    const key =
      (c.referrerId && byReferrer.has(c.referrerId))
        ? c.referrerId
        : (c.referralActorId ? actorIdToLegacy.get(c.referralActorId) : undefined);
    if (key) byReferrer.get(key)!.push({ amountCents: c.amountCents, status: c.status });
  }

  return referrers.map(r => ({ ...r, commissions: byReferrer.get(r.id) ?? [] }));
}

/**
 * For each legacy Referrer, look up its modern ReferralActor and its active
 * ReferralAssignment.parentEntityId — that is the "resolved organization"
 * the Org Resolver review queue produces. Returns a map of
 * referrer.id → { entityId, displayName } when resolved.
 */
async function getReferrerToParentEntityMap(referrerIds: string[]) {
  if (referrerIds.length === 0) return new Map<string, { entityId: string; displayName: string }>();
  const actors = await prisma.referralActor.findMany({
    where: { legacyReferrerId: { in: referrerIds } },
    select: {
      legacyReferrerId: true,
      assignments: {
        where: { isActive: true, parentEntityId: { not: null } },
        select: { parentEntityId: true },
        take: 1,
      },
    },
  });
  const entityIds = Array.from(
    new Set(actors.flatMap(a => a.assignments.map(x => x.parentEntityId).filter(Boolean) as string[])),
  );
  const entities = entityIds.length
    ? await prisma.entity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const entityMap = new Map(entities.map(e => [e.id, e.displayName]));
  const out = new Map<string, { entityId: string; displayName: string }>();
  for (const a of actors) {
    const eid = a.assignments[0]?.parentEntityId;
    if (a.legacyReferrerId && eid && entityMap.has(eid)) {
      out.set(a.legacyReferrerId, { entityId: eid, displayName: entityMap.get(eid)! });
    }
  }
  return out;
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const TYPE_LABELS: Record<string, string> = {
  STREETSIDE_HOST: "Streetside Host",
  TAXI_DRIVER: "Taxi Driver",
  HOTEL_CONCIERGE: "Concierge",
  TOUR_GUIDE: "Tour Guide",
  PARTNER: "Partner",
};

interface RolledRow {
  kind: "ENTITY" | "REFERRER";
  rowId: string;
  primaryName: string;
  subtitle?: string;
  members: ReferrerRow[];
  totalPaid: number;
  totalPending: number;
  initiated: number;
  patronized: number;
}

function rollUp(referrers: ReferrerRow[], parentMap: Map<string, { entityId: string; displayName: string }>): RolledRow[] {
  const byEntity = new Map<string, RolledRow>();
  const standalone: RolledRow[] = [];

  for (const r of referrers) {
    const paid = r.commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0);
    const pending = r.commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0);
    const initiated = r.attributions.length;
    // Pre-existing bug surfaced during Task #66 review: previous code filtered
    // by ["RESERVED","ATTENDED"] which are not valid `conversionStage` values
    // (the enum is INITIATED/REFERRED_UPSTAIRS/ARRIVED/OFFERED/PATRONIZED/
    // DECLINED/LOST — see STAGE_LABELS on the detail page). That filter
    // always evaluated to 0, zeroing the conversion% column. Aligning with
    // every other surface that defines "patronized" as `conversionStage === "PATRONIZED"`.
    const patronized = r.attributions.filter(a => a.conversionStage === "PATRONIZED").length;

    const parent = parentMap.get(r.id);
    if (parent) {
      const existing = byEntity.get(parent.entityId);
      if (existing) {
        existing.members.push(r);
        existing.totalPaid += paid;
        existing.totalPending += pending;
        existing.initiated += initiated;
        existing.patronized += patronized;
      } else {
        byEntity.set(parent.entityId, {
          kind: "ENTITY",
          rowId: parent.entityId,
          primaryName: parent.displayName,
          subtitle: undefined,
          members: [r],
          totalPaid: paid,
          totalPending: pending,
          initiated,
          patronized,
        });
      }
    } else {
      standalone.push({
        kind: "REFERRER",
        rowId: r.id,
        primaryName: r.fullName,
        subtitle: r.organizationName ?? undefined,
        members: [r],
        totalPaid: paid,
        totalPending: pending,
        initiated,
        patronized,
      });
    }
  }

  return [
    ...Array.from(byEntity.values()).sort((a, b) => a.primaryName.localeCompare(b.primaryName)),
    ...standalone.sort((a, b) => a.primaryName.localeCompare(b.primaryName)),
  ];
}

export default async function PartnersReportsPage() {
  const referrers = await getReferrers();
  const parentMap = await getReferrerToParentEntityMap(referrers.map(r => r.id));
  const rolledRows = rollUp(referrers, parentMap);

  const totalPaid = rolledRows.reduce((s, r) => s + r.totalPaid, 0);
  const totalPending = rolledRows.reduce((s, r) => s + r.totalPending, 0);
  const groupedCount = rolledRows.filter(r => r.kind === "ENTITY").length;

  const kpiRow = (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "14px 20px" }}>
        <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>Active Partners</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{referrers.length}</div>
        {groupedCount > 0 && (
          <div style={{ fontSize: 10, color: "#7d7269", marginTop: 2 }}>across {rolledRows.length} organizations</div>
        )}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "14px 20px" }}>
        <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>Total Paid Out</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: "#1f8a55" }}>{fmt(totalPaid)}</div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "14px 20px" }}>
        <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>Pending Payout</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: "#92700a" }}>{fmt(totalPending)}</div>
      </div>
    </div>
  );

  return (
    <AdminPageShell
      eyebrow="Admin · Partners"
      title="Partner Reports"
      subtitle="Active referrers grouped by their resolved parent organization where available; unresolved referrers list individually."
      kpiRow={kpiRow}
    >
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e2dd", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#faf8f6", borderBottom: "2px solid #e8e2dd" }}>
                {["Organization / Partner", "Members", "Initiated", "Patronized", "Conv.%", "Plan", "Paid", "Pending", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rolledRows.map(row => {
                const conv = row.initiated > 0 ? Math.round((row.patronized / row.initiated) * 100) : 0;
                const planLabels = Array.from(new Set(row.members.map(m => m.compensationPlan?.name).filter(Boolean)));
                const isEntity = row.kind === "ENTITY";

                return (
                  <tr key={`${row.kind}_${row.rowId}`} style={{ borderBottom: "1px solid #f0ebe7" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                        {isEntity && (
                          <span style={{ fontSize: 9, padding: "2px 6px", background: "#e8f4ed", color: "#1f8a55", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Org</span>
                        )}
                        {row.primaryName}
                      </div>
                      {row.subtitle && <div style={{ fontSize: 11, color: "#7d7269" }}>{row.subtitle}</div>}
                      {isEntity && (
                        <div style={{ fontSize: 11, color: "#7d7269", marginTop: 2 }}>
                          {row.members.map(m => (
                            <span key={m.id} style={{ marginRight: 8 }}>
                              {m.fullName}
                              <span style={{ color: "#c41e3a", fontFamily: "monospace", marginLeft: 4 }}>{m.referralCode}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {!isEntity && (
                        <div style={{ fontSize: 11, color: "#c41e3a", fontFamily: "monospace", marginTop: 2 }}>{row.members[0]!.referralCode}</div>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {isEntity ? (
                        <StatusChip status="green" label={`${row.members.length} member${row.members.length === 1 ? "" : "s"}`} size="xs" />
                      ) : (
                        <StatusChip status="gray" label={TYPE_LABELS[row.members[0]!.referrerType] ?? row.members[0]!.referrerType.replace("_"," ")} size="xs" />
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "center" }}>{row.initiated}</td>
                    <td style={{ padding: "14px 16px", textAlign: "center" }}>{row.patronized}</td>
                    <td style={{ padding: "14px 16px", textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: conv >= 50 ? "#1f8a55" : conv >= 25 ? "#92700a" : "#c41e3a" }}>{conv}%</span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: "#7d7269" }}>
                      {planLabels.length === 0 ? "—" : planLabels.length === 1 ? planLabels[0] : `${planLabels.length} plans`}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "#1f8a55" }}>{fmt(row.totalPaid)}</td>
                    <td style={{ padding: "14px 16px", color: "#92700a" }}>{fmt(row.totalPending)}</td>
                    <td style={{ padding: "14px 16px" }}>
                      {isEntity ? (
                        <span style={{ fontSize: 11, color: "#7d7269" }}>{row.members.length} members</span>
                      ) : (
                        <Link href={`/admin/partners/reports/${row.rowId}`} style={{ fontSize: 12, color: "#c41e3a", fontWeight: 700, textDecoration: "none" }}>View →</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </AdminPageShell>
  );
}
