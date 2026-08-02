"use client";

import * as React from "react";
import StatusChip from "@/components/ui/StatusChip";
import {
  PAYOUT_EXPORT_FORMATS,
  PAYOUT_EXPORT_FORMAT_DESCRIPTORS,
  type PayoutExportFormat,
} from "@/server/payouts/exportFormats";

type BatchStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXPORTED" | "OPEN" | "CLOSED";

type Batch = {
  id: string;
  name: string | null;
  status: BatchStatus;
  currency: string;
  totalCents: number;
  lineCount: number;
  from: string | Date;
  to: string | Date;
  createdAt: string | Date;
  createdById: string | null;
  submittedAt: string | Date | null;
  submittedById: string | null;
  approvedAt: string | Date | null;
  approvedById: string | null;
  rejectedAt: string | Date | null;
  rejectedById: string | null;
  rejectionReason: string | null;
  exportedAt: string | Date | null;
  exportedById: string | null;
  exportFormat: string | null;
};

type EligibleLine = {
  ledgerEntryId: string;
  influencerId: string;
  influencerDisplayName: string;
  influencerHandle: string | null;
  influencerStatus: string;
  orderId: string | null;
  orderNumber: string | null;
  orderTotalCents: number | null;
  amountCents: number;
  currency: string;
  type: "COMMISSION_EARNED" | "COMMISSION_REVERSED";
  createdAt: string;
  note: string | null;
};

type BlockedLine = EligibleLine & { reason: string };

type Preview = {
  range: { from: string; to: string };
  eligibleLines: EligibleLine[];
  blockedLines: BlockedLine[];
  byInfluencer: Array<{
    influencerId: string;
    influencerDisplayName: string;
    grossCents: number;
    reversedCents: number;
    netCents: number;
    lineCount: number;
    isBlocked: boolean;
    blockReason?: string;
  }>;
  totals: {
    eligibleNetCents: number;
    blockedCents: number;
    eligibleLineCount: number;
    blockedLineCount: number;
  };
};

type BatchDetail = Batch & {
  notes: string | null;
  closedAt: string | null;
  lines: Array<{
    ledgerEntryId: string;
    type: string;
    amountCents: number;
    currency: string;
    createdAt: string;
    note: string | null;
    influencerId: string;
    influencerDisplayName: string;
    influencerHandle: string | null;
    influencerStatus: string;
    orderId: string | null;
    orderNumber: string | null;
    orderTotalCents: number | null;
    attributionSource: string | null;
  }>;
};

const STATUS_LABELS: Record<BatchStatus, { label: string; color: "gray" | "amber" | "green" | "red" | "blue" }> = {
  DRAFT: { label: "Draft", color: "gray" },
  PENDING_APPROVAL: { label: "Pending approval", color: "amber" },
  APPROVED: { label: "Approved", color: "blue" },
  REJECTED: { label: "Rejected", color: "red" },
  EXPORTED: { label: "Exported", color: "green" },
  OPEN: { label: "Open (legacy)", color: "gray" },
  CLOSED: { label: "Closed (legacy)", color: "gray" },
};

const BLOCK_REASON_LABELS: Record<string, string> = {
  INFLUENCER_INACTIVE: "Influencer not approved",
  INFLUENCER_MISSING: "Influencer record missing",
  NET_NON_POSITIVE: "Net amount ≤ $0 after reversals",
  ALREADY_IN_BATCH: "Already in another batch",
};

function fmtMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}
function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default function PayoutBatchesPanel({ initialBatches }: { initialBatches: Batch[] }) {
  const [batches, setBatches] = React.useState<Batch[]>(initialBatches);
  const [tab, setTab] = React.useState<"flight" | "completed">("flight");
  const [openDetailId, setOpenDetailId] = React.useState<string | null>(null);
  const [showNew, setShowNew] = React.useState(false);

  async function refresh() {
    const r = await fetch("/api/v1/admin/payouts/batches", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setBatches(j.batches);
    }
  }

  const flightStatuses: BatchStatus[] = ["DRAFT", "PENDING_APPROVAL"];
  const completedStatuses: BatchStatus[] = ["APPROVED", "EXPORTED", "REJECTED", "CLOSED"];
  const filtered = batches.filter(b =>
    tab === "flight" ? flightStatuses.includes(b.status) : completedStatuses.includes(b.status) || b.status === "OPEN",
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4, background: "#f3eee9", borderRadius: 8, padding: 4 }}>
          <TabButton active={tab === "flight"} onClick={() => setTab("flight")}>
            In flight ({batches.filter(b => flightStatuses.includes(b.status)).length})
          </TabButton>
          <TabButton active={tab === "completed"} onClick={() => setTab("completed")}>
            Completed ({batches.filter(b => completedStatuses.includes(b.status) || b.status === "OPEN").length})
          </TabButton>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ padding: "10px 18px", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          + New batch
        </button>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e2dd", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#faf8f6", borderBottom: "2px solid #e8e2dd" }}>
              {["Batch", "Status", "Period", "Lines", "Total", "Created", "Submitted", "Approved", ""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#7d7269" }}>
                  {tab === "flight" ? "No batches in flight. Click + New batch to start one." : "No completed batches yet."}
                </td>
              </tr>
            )}
            {filtered.map(b => {
              const meta = STATUS_LABELS[b.status];
              return (
                <tr key={b.id} style={{ borderBottom: "1px solid #f0ebe7" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name ?? "(unnamed)"}</div>
                    <div style={{ fontSize: 11, color: "#7d7269", fontFamily: "monospace" }}>{b.id.slice(0, 12)}…</div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusChip status={meta.color} label={meta.label} size="xs" />
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 12 }}>
                    {fmtDate(b.from)} → {fmtDate(b.to)}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>{b.lineCount}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 700, color: "#1f8a55" }}>{fmtMoney(b.totalCents, b.currency)}</td>
                  <td style={{ padding: "14px 16px", fontSize: 12, color: "#7d7269" }}>
                    {fmtDate(b.createdAt)}<br/><span style={{ fontFamily: "monospace", fontSize: 10 }}>{b.createdById?.slice(0, 8) ?? "—"}</span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 12, color: "#7d7269" }}>
                    {b.submittedAt ? <>{fmtDate(b.submittedAt)}<br/><span style={{ fontFamily: "monospace", fontSize: 10 }}>{b.submittedById?.slice(0, 8) ?? "—"}</span></> : "—"}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 12, color: "#7d7269" }}>
                    {b.approvedAt ? <>{fmtDate(b.approvedAt)}<br/><span style={{ fontFamily: "monospace", fontSize: 10 }}>{b.approvedById?.slice(0, 8) ?? "—"}</span></> : "—"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <button onClick={() => setOpenDetailId(b.id)} style={{ fontSize: 12, color: "#c41e3a", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>
                      Open →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openDetailId && (
        <BatchDetailDrawer batchId={openDetailId} onClose={() => setOpenDetailId(null)} onChanged={refresh} />
      )}
      {showNew && (
        <NewBatchDrawer onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); refresh(); }} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        background: active ? "#fff" : "transparent",
        border: "none",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 700,
        color: active ? "#1a1a1a" : "#7d7269",
        cursor: "pointer",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {children}
    </button>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────────

function BatchDetailDrawer({ batchId, onClose, onChanged }: { batchId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = React.useState<BatchDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      const r = await fetch(`/api/v1/admin/payouts/batches/${batchId}`, { cache: "no-store" });
      if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error ?? "Failed to load"); setLoading(false); return; }
      const j = await r.json();
      setDetail(j.batch);
      setLoading(false);
    })();
  }, [batchId]);

  async function callAction(path: string, body?: object) {
    setActionBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/v1/admin/payouts/batches/${batchId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error ?? `Action failed (${r.status})`); setActionBusy(false); return; }
      // Reload detail
      const d = await fetch(`/api/v1/admin/payouts/batches/${batchId}`, { cache: "no-store" });
      if (d.ok) setDetail((await d.json()).batch);
      onChanged();
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <Drawer onClose={onClose} title={detail?.name ?? "Loading…"}>
      {loading && <div style={{ padding: 16 }}>Loading…</div>}
      {err && <div style={{ padding: 12, background: "#fde8e8", color: "#c41e3a", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}
      {detail && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <KV label="Status"><StatusChip {...({ status: STATUS_LABELS[detail.status].color, label: STATUS_LABELS[detail.status].label, size: "xs" } as React.ComponentProps<typeof StatusChip>)} /></KV>
            <KV label="Period">{fmtDate(detail.from)} → {fmtDate(detail.to)}</KV>
            <KV label="Lines">{detail.lineCount}</KV>
            <KV label="Total"><b style={{ color: "#1f8a55" }}>{fmtMoney(detail.totalCents, detail.currency)}</b></KV>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 12, color: "#7d7269" }}>
            <KV label="Created by">{detail.createdById ? <code>{detail.createdById.slice(0, 12)}…</code> : "—"} on {fmtDate(detail.createdAt)}</KV>
            {detail.submittedAt && <KV label="Submitted by"><code>{detail.submittedById?.slice(0, 12)}…</code> on {fmtDate(detail.submittedAt)}</KV>}
            {detail.approvedAt && <KV label="Approved by"><code>{detail.approvedById?.slice(0, 12)}…</code> on {fmtDate(detail.approvedAt)}</KV>}
            {detail.rejectedAt && <KV label="Rejected by"><code>{detail.rejectedById?.slice(0, 12)}…</code> on {fmtDate(detail.rejectedAt)} — “{detail.rejectionReason}”</KV>}
            {detail.exportedAt && <KV label="Exported"><code>{detail.exportFormat}</code> by <code>{detail.exportedById?.slice(0, 12)}…</code> on {fmtDate(detail.exportedAt)}</KV>}
          </div>

          <ActionBar batch={detail} busy={actionBusy} onAction={callAction} />

          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 24, marginBottom: 8 }}>
            Traceability — {detail.lines.length} ledger lines
          </h3>
          <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 8, overflow: "hidden", maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#faf8f6", position: "sticky", top: 0 }}>
                  {["Order #", "Source", "Influencer", "Type", "Amount", "When"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.lines.map(ln => (
                  <tr key={ln.ledgerEntryId} style={{ borderBottom: "1px solid #f3eee9" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{ln.orderNumber ?? "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#7d7269" }}>{ln.attributionSource ?? "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ fontWeight: 600 }}>{ln.influencerDisplayName}</div>
                      {ln.influencerHandle && <div style={{ color: "#7d7269", fontSize: 11 }}>@{ln.influencerHandle}</div>}
                      {ln.influencerStatus !== "ACTIVE" && (
                        <div style={{ color: "#c41e3a", fontSize: 10, marginTop: 2 }}>⚠ {ln.influencerStatus}</div>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", color: ln.type === "COMMISSION_REVERSED" ? "#c41e3a" : "#7d7269" }}>{ln.type.replace("COMMISSION_", "")}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: ln.type === "COMMISSION_REVERSED" ? "#c41e3a" : "#1f8a55" }}>
                      {ln.type === "COMMISSION_REVERSED" ? "−" : ""}{fmtMoney(ln.amountCents, ln.currency)}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#7d7269" }}>{fmtDate(ln.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Drawer>
  );
}

function ActionBar({ batch, busy, onAction }: { batch: BatchDetail; busy: boolean; onAction: (path: string, body?: object) => void }) {
  const [rejectReason, setRejectReason] = React.useState("");
  const [showReject, setShowReject] = React.useState(false);

  if (batch.status === "DRAFT") {
    return (
      <div style={{ display: "flex", gap: 8, padding: 12, background: "#faf8f6", borderRadius: 8 }}>
        <button disabled={busy} onClick={() => onAction("/submit")} style={btnPrimary}>Submit for approval</button>
        <button disabled={busy} onClick={() => { if (confirm("Discard this draft? Lines will be released back to eligible.")) onAction("/discard"); }} style={btnGhost}>Discard draft</button>
      </div>
    );
  }
  if (batch.status === "PENDING_APPROVAL") {
    return (
      <div style={{ padding: 12, background: "#faf8f6", borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: "#92700a", marginBottom: 8 }}>
          ⚠ Maker/checker enforced: a different admin must approve. The user who submitted this batch cannot approve it.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={busy} onClick={() => onAction("/approve")} style={btnPrimary}>Approve</button>
          <button disabled={busy} onClick={() => setShowReject(s => !s)} style={btnGhost}>Reject…</button>
        </div>
        {showReject && (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason (required)"
              style={{ flex: 1, padding: 8, border: "1px solid #e8e2dd", borderRadius: 6, fontSize: 13 }} />
            <button disabled={busy || !rejectReason.trim()} onClick={() => onAction("/reject", { reason: rejectReason })} style={btnDanger}>
              Confirm reject
            </button>
          </div>
        )}
      </div>
    );
  }
  if (batch.status === "APPROVED") {
    return <ExportActionBar busy={busy} onAction={onAction} />;
  }
  return (
    <div style={{ padding: 12, background: "#f3eee9", borderRadius: 8, fontSize: 12, color: "#7d7269" }}>
      No actions available for {STATUS_LABELS[batch.status].label}.
    </div>
  );
}

// ── Export action bar ────────────────────────────────────────────────────
//
// Bank-agnostic: the operator picks which file format they're committing
// to. The list of formats and their per-format status badges come from
// the registry on the server (`src/server/payouts/exportFormats`) so the
// UI stays in sync without any hand-maintained constants.

const FORMAT_STATUS_LABELS: Record<
  "READY" | "PENDING_SPEC" | "PLANNED",
  { label: string; color: string; bg: string }
> = {
  READY: { label: "Ready", color: "#1f8a55", bg: "#e8f4ed" },
  PENDING_SPEC: { label: "Pending bank spec", color: "#92700a", bg: "#fdf3d8" },
  PLANNED: { label: "Planned", color: "#7d7269", bg: "#f3eee9" },
};

function ExportActionBar({
  busy,
  onAction,
}: {
  busy: boolean;
  onAction: (path: string, body?: object) => void;
}) {
  // Default to the first READY format so the operator always lands on a
  // working choice; fall back to the first registered format otherwise.
  const defaultFormat: PayoutExportFormat = React.useMemo(() => {
    const ready = PAYOUT_EXPORT_FORMATS.find(
      f => PAYOUT_EXPORT_FORMAT_DESCRIPTORS[f].status === "READY",
    );
    return ready ?? PAYOUT_EXPORT_FORMATS[0];
  }, []);
  const [format, setFormat] = React.useState<PayoutExportFormat>(defaultFormat);
  const descriptor = PAYOUT_EXPORT_FORMAT_DESCRIPTORS[format];
  const statusMeta = FORMAT_STATUS_LABELS[descriptor.status];

  return (
    <div style={{ padding: 12, background: "#e8f4ed", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 600 }}>
          Bank file format:
          <select
            value={format}
            onChange={e => setFormat(e.target.value as PayoutExportFormat)}
            disabled={busy}
            style={{
              marginLeft: 8,
              padding: "6px 10px",
              fontSize: 13,
              border: "1px solid #cbd5cb",
              borderRadius: 6,
              background: "#fff",
            }}
          >
            {PAYOUT_EXPORT_FORMATS.map(f => {
              const d = PAYOUT_EXPORT_FORMAT_DESCRIPTORS[f];
              const tag = FORMAT_STATUS_LABELS[d.status].label;
              return (
                <option key={f} value={f}>
                  {d.label} — {tag}
                </option>
              );
            })}
          </select>
        </label>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 4,
            color: statusMeta.color,
            background: statusMeta.bg,
          }}
        >
          {statusMeta.label}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#5a5048", marginTop: 8 }}>
        {descriptor.note} <em style={{ color: "#7d7269" }}>· Destination: {descriptor.destination}</em>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button
          disabled={busy}
          onClick={() => onAction("/export", { format })}
          style={btnPrimary}
        >
          Export & lock batch
        </button>
        <span style={{ fontSize: 12, color: "#1f8a55", alignSelf: "center" }}>
          Once exported the batch becomes immutable and audit-locked.
        </span>
      </div>
      {descriptor.status !== "READY" && (
        <div style={{ fontSize: 11, color: "#92700a", marginTop: 8 }}>
          ⚠ This format records the operator's intent on the batch but cannot yet
          render an actual bank file. The audit hash is still produced and locked.
        </div>
      )}
    </div>
  );
}

// ── New batch drawer ────────────────────────────────────────────────────

function NewBatchDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [from, setFrom] = React.useState(monthStart);
  const [to, setTo] = React.useState(monthEnd);
  const [name, setName] = React.useState(`Payout · ${today.toLocaleString("en", { month: "long", year: "numeric" })}`);
  const [notes, setNotes] = React.useState("");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function loadPreview() {
    setLoadingPreview(true); setErr(null);
    const fromIso = new Date(`${from}T00:00:00`).toISOString();
    const toIso = new Date(`${to}T23:59:59`).toISOString();
    const r = await fetch(`/api/v1/admin/payouts/eligible-lines?from=${fromIso}&to=${toIso}`, { cache: "no-store" });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error ?? "Failed to load preview"); setLoadingPreview(false); return; }
    const j = await r.json();
    setPreview(j.preview);
    setLoadingPreview(false);
  }

  async function createBatch() {
    if (!preview || preview.eligibleLines.length === 0) return;
    setCreating(true); setErr(null);
    const fromIso = new Date(`${from}T00:00:00`).toISOString();
    const toIso = new Date(`${to}T23:59:59`).toISOString();
    const r = await fetch("/api/v1/admin/payouts/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        notes: notes || null,
        from: fromIso,
        to: toIso,
        ledgerEntryIds: preview.eligibleLines.map(l => l.ledgerEntryId),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j?.error ?? "Create failed"); setCreating(false); return; }
    onCreated();
  }

  return (
    <Drawer onClose={onClose} title="New payout batch">
      {err && <div style={{ padding: 12, background: "#fde8e8", color: "#c41e3a", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Batch name"><input value={name} onChange={e => setName(e.target.value)} style={inputCss} /></Field>
        <Field label="Notes (optional)"><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal note" style={inputCss} /></Field>
        <Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputCss} /></Field>
        <Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputCss} /></Field>
      </div>

      <button disabled={loadingPreview} onClick={loadPreview} style={btnGhost}>
        {loadingPreview ? "Loading preview…" : preview ? "Refresh preview" : "Load preview"}
      </button>

      {preview && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <Stat label="Eligible lines" value={preview.totals.eligibleLineCount} />
            <Stat label="Eligible total" value={fmtMoney(preview.totals.eligibleNetCents)} green />
            <Stat label="Blocked lines" value={preview.totals.blockedLineCount} amber />
            <Stat label="Blocked total" value={fmtMoney(preview.totals.blockedCents)} amber />
          </div>

          <h4 style={subhead}>By influencer</h4>
          <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 8, marginBottom: 16, maxHeight: 220, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: "#faf8f6", position: "sticky", top: 0 }}>
                {["Influencer", "Lines", "Gross", "Reversed", "Net", "Status"].map(h => (
                  <th key={h} style={thCss}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {preview.byInfluencer.map(g => (
                  <tr key={g.influencerId} style={{ borderBottom: "1px solid #f3eee9", opacity: g.isBlocked ? 0.6 : 1 }}>
                    <td style={{ padding: "6px 12px", fontWeight: 600 }}>{g.influencerDisplayName}</td>
                    <td style={{ padding: "6px 12px" }}>{g.lineCount}</td>
                    <td style={{ padding: "6px 12px", color: "#1f8a55" }}>{fmtMoney(g.grossCents)}</td>
                    <td style={{ padding: "6px 12px", color: "#c41e3a" }}>{g.reversedCents > 0 ? `−${fmtMoney(g.reversedCents)}` : "—"}</td>
                    <td style={{ padding: "6px 12px", fontWeight: 700 }}>{fmtMoney(g.netCents)}</td>
                    <td style={{ padding: "6px 12px" }}>
                      {g.isBlocked
                        ? <span style={{ color: "#c41e3a", fontSize: 11 }}>⛔ {BLOCK_REASON_LABELS[g.blockReason ?? ""] ?? g.blockReason}</span>
                        : <span style={{ color: "#1f8a55", fontSize: 11 }}>✓ Eligible</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            disabled={creating || preview.eligibleLines.length === 0}
            onClick={createBatch}
            style={{ ...btnPrimary, opacity: preview.eligibleLines.length === 0 ? 0.4 : 1 }}
          >
            {creating ? "Creating…" : `Create draft with ${preview.eligibleLines.length} line${preview.eligibleLines.length === 1 ? "" : "s"}`}
          </button>
          {preview.eligibleLines.length === 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#7d7269" }}>No eligible lines for this period — adjust dates or resolve blocked influencers.</div>
          )}
        </div>
      )}
    </Drawer>
  );
}

// ── Drawer + atoms ─────────────────────────────────────────────────────

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(900px, 92vw)", height: "100%", background: "#faf8f6", padding: 24, overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#7d7269" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}
function Stat({ label, value, green, amber }: { label: string; value: string | number; green?: boolean; amber?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 8, padding: "10px 14px", flex: 1 }}>
      <div style={{ fontSize: 10, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: green ? "#1f8a55" : amber ? "#92700a" : "#1a1a1a" }}>{value}</div>
    </div>
  );
}

const inputCss: React.CSSProperties = { width: "100%", padding: 8, border: "1px solid #e8e2dd", borderRadius: 6, fontSize: 13 };
const thCss: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 10, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 };
const subhead: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 12, marginBottom: 8 };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "10px 18px", background: "transparent", color: "#1a1a1a", border: "1px solid #e8e2dd", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: "10px 18px", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" };
