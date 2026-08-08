import AdminPageShell from "@/components/admin/AdminPageShell";
import PayoutBatchesPanel from "@/components/admin/payouts/PayoutBatchesPanel";
import { listBatches } from "@/server/payouts/payoutBatchService";

export const dynamic = "force-dynamic";

export default async function AdminPayoutsPage() {
  const batches = await listBatches({});
  const draftCount = batches.filter(b => b.status === "DRAFT").length;
  const pendingCount = batches.filter(b => b.status === "PENDING_APPROVAL").length;
  const approvedCount = batches.filter(b => b.status === "APPROVED").length;

  const kpiRow = (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "14px 20px", minWidth: 140 }}>
        <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>Drafts</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{draftCount}</div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "14px 20px", minWidth: 140 }}>
        <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>Awaiting approval</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: "#92700a" }}>{pendingCount}</div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "14px 20px", minWidth: 140 }}>
        <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>Approved · ready to export</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: "#1f8a55" }}>{approvedCount}</div>
      </div>
    </div>
  );

  return (
    <AdminPageShell
      eyebrow="Admin · Finance"
      title="Payout Verification"
      subtitle="Build, review, approve, and export payout batches. Maker/checker enforced — submitter cannot approve their own batch. Every state change is audit-logged. The bank file format is selected per export — no default — and recorded with a deterministic SHA-256 of the canonical payload."
      kpiRow={kpiRow}
    >
      <div style={{ background: "#f8f4ef", border: "1px solid #e8e2dd", borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "#5a4f47", lineHeight: 1.5 }}>
          Payout batches will refuse to advance if any included influencer is not <b>BANK_READY</b>.
          Manage beneficiary records and bank-readiness status in the Beneficiaries view.
        </div>
        <a href="/admin/payouts/beneficiaries" style={{ padding: "8px 14px", borderRadius: 6, background: "#1f1d1b", color: "#fff", fontWeight: 600, textDecoration: "none", fontSize: 13 }}>
          Open Beneficiaries →
        </a>
      </div>
      <PayoutBatchesPanel initialBatches={batches} />
    </AdminPageShell>
  );
}
