import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import StatusChip from "@/components/ui/StatusChip";
import MetricCard from "@/components/ui/MetricCard";
import AdminPageShell from "@/components/admin/AdminPageShell";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

export const dynamic = "force-dynamic";

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const LOSS_LABELS: Record<string, string> = {
  PREFERRED_SEATING_UNAVAILABLE: "Preferred seating unavailable",
  TERRACE_UNAVAILABLE: "Terrace unavailable",
  WAIT_TOO_LONG: "Wait too long",
  TABLE_NOT_READY: "Table not ready",
  GROUP_TOO_LARGE: "Group too large",
  NOT_ENOUGH_SEATS: "Not enough seats",
  NOT_INTERESTED_IN_MENU: "Menu not a fit",
  PRICE_CONCERN: "Price concern",
  BAD_SERVICE: "Bad service",
  ELEVATOR_NOT_WORKING: "Elevator issue",
  CHANGED_MIND: "Changed mind",
  WENT_ELSEWHERE: "Went elsewhere",
  NO_RESPONSE: "No response",
  OTHER: "Other",
};

const STAGE_LABELS: Record<string, string> = {
  INITIATED: "Initiated",
  REFERRED_UPSTAIRS: "Referred Upstairs",
  ARRIVED: "Arrived",
  OFFERED: "Offered",
  PATRONIZED: "Patronized",
  DECLINED: "Declined",
  LOST: "Lost",
};

async function getData(id: string) {
  // Nested `commissions` include intentionally REMOVED — see
  // src/server/commissions/earnerScope.ts. Re-attached separately via the
  // OR-clause helper so commissions written with only `referralActorId`
  // are still surfaced on this admin partner detail page.
  const referrer = await prisma.referrer.findUnique({
    where: { id },
    include: {
      compensationPlan: true,
      commissionSuggestions: {
        include: { reservation: { select: { partySize: true, conceptRequested: true } } },
        orderBy: { createdAt: "desc" },
      },
      benefits: { orderBy: { createdAt: "desc" } },
      attributions: {
        include: { reservation: { select: { partySize: true, conceptRequested: true, reservationDate: true, status: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!referrer) return null;

  const earnerScope = (await resolveEarnerScopeForReferrer(referrer.id))!;
  const commissions = await prisma.commissionEntry.findMany({
    where: commissionWhereForEarner(earnerScope),
    include: { reservation: { select: { partySize: true, conceptRequested: true, reservationDate: true } } },
    orderBy: { createdAt: "desc" },
  });
  return { ...referrer, commissions };
}

export default async function PartnerReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const referrer = await getData(id);
  if (!referrer) notFound();

  const attrs = referrer.attributions;
  const initiated = attrs.length;
  const arrived = attrs.filter(a => ["ARRIVED","OFFERED","PATRONIZED"].includes(a.conversionStage)).length;
  const patronized = attrs.filter(a => a.conversionStage === "PATRONIZED").length;
  const lost = attrs.filter(a => a.conversionStage === "LOST").length;
  const covers = attrs.filter(a => a.conversionStage === "PATRONIZED").reduce((s, a) => s + (a.coversAttributed ?? 0), 0);
  const conv = arrived > 0 ? Math.round((patronized / arrived) * 100) : 0;

  const totalPaid = referrer.commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0);
  const totalPending = referrer.commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0);
  const totalApproved = referrer.commissions.filter(c => c.status === "APPROVED").reduce((s, c) => s + c.amountCents, 0);

  const lossReasonCounts: Record<string, number> = {};
  attrs.filter(a => a.lossReason).forEach(a => {
    if (a.lossReason) lossReasonCounts[a.lossReason] = (lossReasonCounts[a.lossReason] ?? 0) + 1;
  });
  const topLossReasons = Object.entries(lossReasonCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

  const TYPE_LABELS: Record<string, string> = {
    STREETSIDE_HOST: "Streetside Host", TAXI_DRIVER: "Taxi Driver",
    HOTEL_CONCIERGE: "Hotel Concierge", TOUR_GUIDE: "Tour Guide", PARTNER: "Partner",
  };

  const heroSlab = (
    <div className="admin-hero-card" style={{ background: "#1a1614", color: "#fff" }}>
      <Link href="/admin/partners/reports" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
        ← Partner Reports
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
            {TYPE_LABELS[referrer.referrerType] ?? referrer.referrerType.replace("_"," ")}
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 300, margin: "0 0 4px" }}>{referrer.fullName}</h1>
          {referrer.organizationName && <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>{referrer.organizationName}</div>}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Referral Code</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: "#f59e0b" }}>{referrer.referralCode}</div>
        </div>
      </div>
    </div>
  );

  return (
    <AdminPageShell hero={heroSlab}>
      <div>
        {/* Compensation Plan */}
        {referrer.compensationPlan && (
          <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "18px 20px", marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 8 }}>Compensation Plan</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 3 }}>{referrer.compensationPlan.name}</div>
            <div style={{ fontSize: 13, color: "#7d7269" }}>{referrer.compensationPlan.modelType.replace(/_/g," ")}</div>
            {referrer.compensationPlan.flatPerCoverCents && (
              <div style={{ fontSize: 13, marginTop: 4, color: "#1f8a55" }}>
                {fmt(referrer.compensationPlan.flatPerCoverCents)} per seated cover
              </div>
            )}
            {referrer.compensationPlan.flatPerPartyCents && (
              <div style={{ fontSize: 13, marginTop: 4, color: "#1f8a55" }}>
                {fmt(referrer.compensationPlan.flatPerPartyCents)} per seated party
              </div>
            )}
            {referrer.compensationPlan.commissionPercent && (
              <div style={{ fontSize: 13, marginTop: 4, color: "#1f8a55" }}>
                {Number(referrer.compensationPlan.commissionPercent)}% commission on revenue
              </div>
            )}
          </div>
        )}

        {/* Performance metrics */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 12 }}>Performance</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 28 }}>
          <MetricCard label="Initiated"   value={initiated} />
          <MetricCard label="Arrived"     value={arrived} />
          <MetricCard label="Patronized"  value={patronized} />
          <MetricCard label="Conversion"  value={`${conv}%`} trend={{ direction: conv >= 50 ? "up" : conv >= 25 ? "flat" : "down", text: "arrival → seated" }} />
          <MetricCard label="Covers"      value={covers} />
          <MetricCard label="Lost"        value={lost} />
        </div>

        {/* Revenue */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 12 }}>Earnings</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          <MetricCard label="Paid Out"  value={fmt(totalPaid)}    accent />
          <MetricCard label="Approved"  value={fmt(totalApproved)} />
          <MetricCard label="Pending"   value={fmt(totalPending)} />
        </div>

        {/* Loss Reasons */}
        {topLossReasons.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "18px 20px", marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 14 }}>Top Loss Reasons</div>
            {topLossReasons.map(([reason, count]) => (
              <div key={reason} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0ebe7" }}>
                <span style={{ fontSize: 13 }}>{LOSS_LABELS[reason] ?? reason.replace(/_/g," ")}</span>
                <span style={{ fontWeight: 700, fontSize: 13, background: "#fef2f2", color: "#991b1b", padding: "2px 10px", borderRadius: 12 }}>{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Attribution History */}
        <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "18px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 14 }}>Attribution History</div>
          {attrs.length === 0 ? (
            <div style={{ color: "#7d7269", fontSize: 13 }}>No attributions yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Date", "Concept", "Party", "Stage", "Covers"].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 11, color: "#7d7269", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 12px 8px 0", borderBottom: "1px solid #f0ebe7" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attrs.slice(0, 20).map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f0ebe7" }}>
                    <td style={{ padding: "10px 12px 10px 0", fontSize: 12, color: "#7d7269" }}>{a.reservation?.reservationDate ? new Date(a.reservation.reservationDate).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "10px 12px 10px 0", fontSize: 13, textTransform: "capitalize" }}>{a.reservation?.conceptRequested ?? "—"}</td>
                    <td style={{ padding: "10px 12px 10px 0", fontSize: 13 }}>{a.reservation?.partySize ?? "—"}</td>
                    <td style={{ padding: "10px 12px 10px 0" }}>
                      <StatusChip status={a.conversionStage === "PATRONIZED" ? "patronized" : a.conversionStage === "LOST" ? "lost" : a.conversionStage === "ARRIVED" ? "arrived" : "initiated"} label={STAGE_LABELS[a.conversionStage] ?? a.conversionStage} size="xs" />
                    </td>
                    <td style={{ padding: "10px 12px 10px 0", fontSize: 13, fontWeight: a.coversAttributed ? 700 : 400 }}>{a.coversAttributed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Commission History */}
        <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 14 }}>Commission Entries</div>
          {referrer.commissions.length === 0 ? (
            <div style={{ color: "#7d7269", fontSize: 13 }}>No commission entries yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Amount", "Covers", "Concept", "Status", "Date"].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 11, color: "#7d7269", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 12px 8px 0", borderBottom: "1px solid #f0ebe7" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referrer.commissions.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f0ebe7" }}>
                    <td style={{ padding: "10px 12px 10px 0", fontWeight: 700, color: "#1f8a55", fontSize: 14 }}>{fmt(c.amountCents)}</td>
                    <td style={{ padding: "10px 12px 10px 0", fontSize: 13 }}>{c.covers ?? "—"}</td>
                    <td style={{ padding: "10px 12px 10px 0", fontSize: 13, textTransform: "capitalize" }}>{c.conceptKey ?? c.reservation?.conceptRequested ?? "—"}</td>
                    <td style={{ padding: "10px 12px 10px 0" }}><StatusChip status={c.status.toLowerCase()} size="xs" /></td>
                    <td style={{ padding: "10px 12px 10px 0", fontSize: 12, color: "#7d7269" }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminPageShell>
  );
}
