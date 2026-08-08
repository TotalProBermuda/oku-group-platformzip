"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BeneficiaryProfileView,
  BeneficiaryProfileSummaryView,
  BankReadinessStatusValue,
  DocStatus,
  BankAccountTypeValue,
  DocStatusSources,
  DocStatusSource,
} from "@/server/beneficiaries/beneficiaryService";
import BeneficiaryDocumentsUploader, {
  type DocumentView,
} from "@/components/account/BeneficiaryDocumentsUploader";

export type BeneficiarySummaryRow = BeneficiaryProfileSummaryView & {
  user: { id: string; name: string | null; email: string };
};

type Props = {
  initial: BeneficiarySummaryRow[];
  /** True when the caller holds `admin:beneficiaries:detail`. When false,
   * the row "Open" affordance is hidden — the user can triage the queue
   * but not open the bank-detail drawer. */
  canSeeDetail: boolean;
};

const STATUS_OPTIONS: BankReadinessStatusValue[] = [
  "MISSING_INFO", "READY_FOR_REVIEW", "OKU_APPROVED",
  "AWAITING_BANK_CONFIRMATION", "BANK_READY", "REJECTED", "ON_HOLD",
];

const DOC_OPTIONS: DocStatus[] = ["NOT_REQUIRED", "MISSING", "RECEIVED", "VERIFIED", "REJECTED"];

const STATUS_PILL: Record<BankReadinessStatusValue, { bg: string; fg: string; label: string }> = {
  MISSING_INFO:               { bg: "#f4ede5", fg: "#7d6a4f", label: "Missing info" },
  READY_FOR_REVIEW:           { bg: "#e8eef7", fg: "#1f4480", label: "Ready for review" },
  OKU_APPROVED:               { bg: "#e6f1ea", fg: "#1f6a3a", label: "OKÜ approved" },
  AWAITING_BANK_CONFIRMATION: { bg: "#fdf3df", fg: "#92700a", label: "Awaiting bank" },
  BANK_READY:                 { bg: "#d8efe1", fg: "#0e6b3b", label: "Bank ready" },
  REJECTED:                   { bg: "#fbe3e1", fg: "#a01a1a", label: "Rejected" },
  ON_HOLD:                    { bg: "#efe5d3", fg: "#7a5a14", label: "On hold" },
};

function StatusPill({ status }: { status: BankReadinessStatusValue }) {
  const s = STATUS_PILL[status];
  return (
    <span style={{
      background: s.bg, color: s.fg, padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
    }}>{s.label}</span>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #d6cdc4", borderRadius: 6, fontSize: 14,
};

export default function BeneficiariesPanel({ initial, canSeeDetail }: Props) {
  const [rows, setRows] = useState<BeneficiarySummaryRow[]>(initial);
  const [filter, setFilter] = useState<BankReadinessStatusValue | "">("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<BeneficiaryProfileView | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter && r.status.bankReadinessStatus !== filter) return false;
      if (q) {
        const needle = q.toLowerCase();
        const hay = `${r.user.name ?? ""} ${r.user.email}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, filter, q]);

  const openRow = openId ? rows.find(r => r.userId === openId) ?? null : null;

  async function reload() {
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    if (q) params.set("q", q);
    const res = await fetch(`/api/v1/admin/payouts/beneficiaries?${params}`, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setRows(json.data);
  }

  function applySummaryUpdate(userId: string, detail: BeneficiaryProfileView) {
    setRows(prev => prev.map(r => r.userId === userId
      ? { ...r, status: { ...r.status, ...detail.status, blockingReasons: detail.status.blockingReasons }, updatedAt: detail.updatedAt }
      : r,
    ));
  }

  async function loadDetail(userId: string) {
    setOpenLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/admin/payouts/beneficiaries/${userId}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load detail");
      setOpenDetail(json.data);
    } catch (e: any) {
      setErr(e.message);
      setOpenDetail(null);
    } finally {
      setOpenLoading(false);
    }
  }

  async function handleOpen(userId: string) {
    setOpenId(userId);
    setOpenDetail(null);
    await loadDetail(userId);
  }

  function handleClose() {
    setOpenId(null);
    setOpenDetail(null);
  }

  async function patch(userId: string, body: Record<string, unknown>) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/v1/admin/payouts/beneficiaries/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      setOpenDetail(json.data);
      applySummaryUpdate(userId, json.data);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function transition(userId: string, to: BankReadinessStatusValue) {
    const reason = window.prompt(`Reason for transitioning to ${to}? (optional)`) || null;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/v1/admin/payouts/beneficiaries/${userId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, reason }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      setOpenDetail(json.data);
      applySummaryUpdate(userId, json.data);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!canSeeDetail && (
        <div style={{
          background: "#f8f4ef", border: "1px solid #e8e2dd", borderRadius: 8,
          padding: 12, marginBottom: 16, fontSize: 13, color: "#5a4f47",
        }}>
          You have queue-only access. Bank account, document, and admin-note
          detail is restricted to Finance and Superadmin.
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Search name or email…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onBlur={reload}
          style={{ padding: "8px 12px", border: "1px solid #d6cdc4", borderRadius: 8, minWidth: 260 }}
        />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as BankReadinessStatusValue | "")}
          onBlur={reload}
          style={{ padding: "8px 12px", border: "1px solid #d6cdc4", borderRadius: 8 }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_PILL[s].label}</option>)}
        </select>
        <button onClick={reload} disabled={busy} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d6cdc4", background: "#fff" }}>
          Refresh
        </button>
        {err && <span style={{ color: "#a01a1a", fontSize: 13 }}>{err}</span>}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f8f4ef", textAlign: "left" }}>
              <th style={{ padding: "10px 14px" }}>User</th>
              <th style={{ padding: "10px 14px" }}>OKÜ approval</th>
              <th style={{ padding: "10px 14px" }}>Bank readiness</th>
              <th style={{ padding: "10px 14px" }}>Payout eligible</th>
              <th style={{ padding: "10px 14px" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.userId} style={{ borderTop: "1px solid #f0ebe5" }}>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ fontWeight: 600 }}>{r.user.name ?? "—"}</div>
                  <div style={{ fontSize: 12, color: "#7d7269" }}>{r.user.email}</div>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {r.status.okuApproved
                    ? <span style={{ color: "#1f6a3a", fontSize: 12, fontWeight: 600 }}>Approved</span>
                    : <span style={{ color: "#7d7269", fontSize: 12 }}>Not approved</span>}
                </td>
                <td style={{ padding: "10px 14px" }}><StatusPill status={r.status.bankReadinessStatus} /></td>
                <td style={{ padding: "10px 14px" }}>
                  {r.status.payoutEligible
                    ? <span style={{ color: "#0e6b3b", fontSize: 12, fontWeight: 600 }}>Yes</span>
                    : <span style={{ color: "#a01a1a", fontSize: 12, fontWeight: 600 }}>Blocked</span>}
                </td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>
                  {canSeeDetail ? (
                    <button onClick={() => handleOpen(r.userId)} style={{ padding: "6px 12px", border: "1px solid #d6cdc4", borderRadius: 6, background: "#fff" }}>
                      Open
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: "#9b8f84" }}>Restricted</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#7d7269" }}>No beneficiaries match your filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openRow && (
        <Drawer
          summary={openRow}
          detail={openDetail}
          loading={openLoading}
          busy={busy}
          onClose={handleClose}
          onPatch={(b) => patch(openRow.userId, b)}
          onTransition={(to) => transition(openRow.userId, to)}
        />
      )}
    </div>
  );
}

function Drawer(props: {
  summary: BeneficiarySummaryRow;
  detail: BeneficiaryProfileView | null;
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onTransition: (to: BankReadinessStatusValue) => Promise<void>;
}) {
  const { summary, detail, loading, busy, onClose, onPatch, onTransition } = props;
  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 100%)",
      background: "#fff", boxShadow: "-12px 0 32px rgba(0,0,0,0.12)", zIndex: 50,
      overflowY: "auto", padding: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#7d7269", textTransform: "uppercase", letterSpacing: "0.07em" }}>Beneficiary</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{summary.user.name ?? summary.user.email}</div>
        </div>
        <button onClick={onClose} style={{ padding: "6px 12px", border: "1px solid #d6cdc4", borderRadius: 6, background: "#fff" }}>Close</button>
      </div>

      <div style={{
        background: "#fdf3df", border: "1px solid #f1e3b8", borderRadius: 8,
        padding: 12, marginBottom: 16, fontSize: 12, color: "#7a5a14",
      }}>
        Restricted compliance data — access is logged.
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "#7d7269", padding: 24, textAlign: "center" }}>
          Loading beneficiary detail…
        </div>
      ) : detail ? (
        <DrawerBody
          row={{ ...detail, user: summary.user }}
          busy={busy}
          onPatch={onPatch}
          onTransition={onTransition}
          onClose={onClose}
        />
      ) : (
        <div style={{ fontSize: 13, color: "#a01a1a", padding: 24, textAlign: "center" }}>
          Could not load detail.
        </div>
      )}
    </div>
  );
}

type DetailRow = BeneficiaryProfileView & {
  user: { id: string; name: string | null; email: string };
};

function DrawerBody(props: {
  row: DetailRow;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onTransition: (to: BankReadinessStatusValue) => Promise<void>;
  onClose: () => void;
}) {
  const { row, busy, onPatch, onTransition, onClose } = props;
  const [docs, setDocs] = useState<DocumentView[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [sources, setSources] = useState<DocStatusSources>({});
  const [sourcesError, setSourcesError] = useState(false);

  async function loadSources() {
    try {
      const r = await fetch(`/api/v1/admin/payouts/beneficiaries/${row.userId}/doc-sources`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        setSources(j.data);
        setSourcesError(false);
      } else {
        setSourcesError(true);
      }
    } catch {
      setSourcesError(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setDocsLoaded(false);
    setSourcesError(false);
    setSources({});
    Promise.all([
      fetch(`/api/v1/admin/payouts/beneficiaries/${row.userId}/documents`, { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch(`/api/v1/admin/payouts/beneficiaries/${row.userId}/doc-sources`, { cache: "no-store" }).then(r => r.json()).catch(() => null),
    ]).then(([dj, sj]) => {
      if (cancelled) return;
      if (dj?.ok) setDocs(dj.data);
      if (sj?.ok) setSources(sj.data); else setSourcesError(true);
      setDocsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [row.userId]);

  const [form, setForm] = useState({
    bankName: row.bank.bankName ?? "",
    accountHolderName: row.bank.accountHolderName ?? "",
    accountType: (row.bank.accountType ?? "") as BankAccountTypeValue | "",
    currency: row.bank.currency ?? "USD",
    swiftBic: row.bank.swiftBic ?? "",
    banescoAccountNumber: "",
    proofOfAddressStatus: row.documents.proofOfAddressStatus,
    identificationStatus: row.documents.identificationStatus,
    taxOrRucStatus: row.documents.taxOrRucStatus,
    sourceOfFundsStatus: row.documents.sourceOfFundsStatus,
    incomeCertificationRequired: row.documents.incomeCertificationRequired,
    adminVerificationNotes: row.adminVerificationNotes ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(s => ({ ...s, [k]: v }));
  }

  async function save() {
    const body: Record<string, unknown> = {
      bankName: form.bankName || null,
      accountHolderName: form.accountHolderName || null,
      accountType: form.accountType || null,
      currency: form.currency || null,
      swiftBic: form.swiftBic || null,
      proofOfAddressStatus: form.proofOfAddressStatus,
      identificationStatus: form.identificationStatus,
      taxOrRucStatus: form.taxOrRucStatus,
      sourceOfFundsStatus: form.sourceOfFundsStatus,
      incomeCertificationRequired: form.incomeCertificationRequired,
      adminVerificationNotes: form.adminVerificationNotes || null,
    };
    if (form.banescoAccountNumber) body.banescoAccountNumber = form.banescoAccountNumber;
    await onPatch(body);
    await loadSources();
  }

  return (
    <>
      <div style={{ background: "#f8f4ef", border: "1px solid #e8e2dd", borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13, color: "#5a4f47" }}>
        OKÜ can approve this beneficiary internally, but payouts are only released once bank-required information is complete and finance approves the payout batch. Uploaded files are evidence — you still control the per-document status flag (RECEIVED / VERIFIED / REJECTED) below.
      </div>

      <Section title="Status">
        <div style={{ marginBottom: 8 }}><StatusPill status={row.status.bankReadinessStatus} /></div>
        {row.status.blockingReasons.length > 0 && (
          <ul style={{ fontSize: 12, color: "#a01a1a", paddingLeft: 18, marginBottom: 12 }}>
            {row.status.blockingReasons.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STATUS_OPTIONS.filter(s => s !== row.status.bankReadinessStatus).map(s => (
            <button
              key={s}
              disabled={busy}
              onClick={() => onTransition(s)}
              style={{ padding: "4px 10px", border: "1px solid #d6cdc4", borderRadius: 6, background: "#fff", fontSize: 12 }}
            >
              → {STATUS_PILL[s].label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Bank account">
        <Field label="Bank name"><input value={form.bankName} onChange={e => set("bankName", e.target.value)} style={inp} /></Field>
        <Field label="Account holder"><input value={form.accountHolderName} onChange={e => set("accountHolderName", e.target.value)} style={inp} /></Field>
        <Field label="Account type">
          <select value={form.accountType} onChange={e => set("accountType", e.target.value as BankAccountTypeValue | "")} style={inp}>
            <option value="">—</option>
            <option value="CHECKING">Checking</option>
            <option value="SAVINGS">Savings</option>
          </select>
        </Field>
        <Field label="Currency"><input value={form.currency} onChange={e => set("currency", e.target.value)} style={inp} /></Field>
        <Field label="SWIFT/BIC"><input value={form.swiftBic} onChange={e => set("swiftBic", e.target.value)} style={inp} /></Field>
        <Field label={`Banesco account # ${row.bank.accountLast4 ? `(currently •••• ${row.bank.accountLast4})` : "(not set)"}`}>
          <input
            value={form.banescoAccountNumber}
            onChange={e => set("banescoAccountNumber", e.target.value)}
            placeholder="Leave blank to keep current"
            style={inp}
          />
          <div style={{ fontSize: 11, color: "#7d7269", marginTop: 4 }}>
            Encrypted at rest with AES-256-GCM. Only the last 4 digits are displayed anywhere in the UI.
          </div>
        </Field>
      </Section>

      <Section title="Documents (manual review)">
        {([
          ["proofOfAddressStatus", "Proof of address"],
          ["identificationStatus", "ID / passport"],
          ["taxOrRucStatus", "Tax / RUC"],
          ["sourceOfFundsStatus", "Source of funds"],
        ] as const).map(([k, label]) => (
          <Field key={k} label={label}>
            <select value={form[k]} onChange={e => set(k, e.target.value as DocStatus)} style={inp}>
              {DOC_OPTIONS.map(o => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
            </select>
            <DocSourceLine source={sources[k]} error={sourcesError} />
          </Field>
        ))}
        <Field label="Income certification required">
          <input type="checkbox" checked={form.incomeCertificationRequired} onChange={e => set("incomeCertificationRequired", e.target.checked)} />
        </Field>
      </Section>

      <Section title="Uploaded documents">
        {!docsLoaded ? (
          <div style={{ fontSize: 12, color: "#7d7269" }}>Loading documents…</div>
        ) : (
          <BeneficiaryDocumentsUploader
            listEndpoint={`/api/v1/admin/payouts/beneficiaries/${row.userId}/documents`}
            itemEndpoint={(id) => `/api/v1/admin/payouts/beneficiaries/${row.userId}/documents/${id}`}
            initial={docs}
          />
        )}
      </Section>

      <Section title="Admin notes">
        <textarea
          value={form.adminVerificationNotes}
          onChange={e => set("adminVerificationNotes", e.target.value)}
          rows={4}
          style={{ ...inp, minHeight: 80, fontFamily: "inherit" }}
        />
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #d6cdc4", borderRadius: 6, background: "#fff" }}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ padding: "8px 16px", border: 0, borderRadius: 6, background: "#1f1d1b", color: "#fff", fontWeight: 600 }}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </>
  );
}

const SOURCE_LABEL: Record<DocStatusSource["source"], { text: string; color: string }> = {
  AUTO_UPLOAD: { text: "Auto from upload", color: "#1f6a3a" },
  AUTO_DELETE: { text: "Auto from deletion", color: "#92700a" },
  ADMIN:       { text: "Admin", color: "#1f4480" },
  SELF:        { text: "Beneficiary", color: "#5a4f47" },
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

function DocSourceLine({ source, error }: { source: DocStatusSource | undefined; error?: boolean }) {
  if (error) {
    return (
      <div style={{ fontSize: 11, color: "#a01a1a", marginTop: 4 }}>
        Could not load history
      </div>
    );
  }
  if (!source) {
    return (
      <div style={{ fontSize: 11, color: "#9b8f84", marginTop: 4 }}>
        No change recorded yet
      </div>
    );
  }
  const meta = SOURCE_LABEL[source.source];
  const who =
    source.source === "ADMIN" && source.actorName
      ? `${meta.text}: ${source.actorName}`
      : source.source === "SELF" && source.actorName
        ? `${meta.text}: ${source.actorName}`
        : meta.text;
  return (
    <div
      style={{ fontSize: 11, color: meta.color, marginTop: 4 }}
      title={new Date(source.at).toLocaleString()}
    >
      {who} · {formatRelative(source.at)}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#5a4f47", marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}
