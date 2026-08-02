"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import StatusChip from "@/components/ui/StatusChip";

interface TableSession {
  id: string;
  trustScore: number;
  matchMethod: string;
  status: string;
  grossCents: number;
  commissionableCents: number;
  venue: { id: string; name: string };
  reservation: { id: string; confirmationCode: string; partySize: number } | null;
  allocations: Array<{ id: string; amountCents: number; status: string }>;
}

interface Allocation {
  id: string;
  earnerType: string;
  amountCents: number;
  status: string;
  tableSession: {
    id: string;
    trustScore: number;
    matchMethod: string;
    venue: { id: string; name: string };
    reservation: { id: string; confirmationCode: string } | null;
    allocations: Array<{ id: string }>;
  };
}

interface ReviewData {
  pendingReviewSessions: TableSession[];
  disputedAllocations: Allocation[];
  reversedPaidAllocations: Allocation[];
  fullCompSessions: TableSession[];
}

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function trustBadge(score: number) {
  if (score >= 0.95) return { bg: "#e8f5e9", color: "#1b5e20", label: (score * 100).toFixed(0) + "%" };
  if (score >= 0.75) return { bg: "#fef9ec", color: "#92700a", label: (score * 100).toFixed(0) + "%" };
  return { bg: "#fef2f2", color: "#991b1b", label: (score * 100).toFixed(0) + "%" };
}

export default function FinancialTrustReviewPage() {
  const t = useTranslation();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("30d");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ sessionId: string; action: "dispute" | "dismiss" } | null>(null);
  const [noteText, setNoteText] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/admin/revenue/review?preset=${preset}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.data); })
      .finally(() => setLoading(false));
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const doSessionAction = async (sessionId: string, action: string, note?: string) => {
    setActionLoading(sessionId);
    try {
      await fetch(`/api/v1/admin/revenue/sessions/${sessionId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      load();
    } finally {
      setActionLoading(null);
      setNoteModal(null);
      setNoteText("");
    }
  };

  const total =
    (data?.pendingReviewSessions.length ?? 0) +
    (data?.disputedAllocations.length ?? 0) +
    (data?.reversedPaidAllocations.length ?? 0) +
    (data?.fullCompSessions.length ?? 0);

  const isEmpty = !loading && total === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 500, margin: 0 }}>
            {t("admin", "revenue.review.title") || "Financial Trust Review"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
            {t("admin", "revenue.review.subtitle") || "Commission-level items requiring Superadmin attention"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["today", "7d", "30d"].map((p) => (
            <button key={p} onClick={() => setPreset(p)} className={preset === p ? "btn btn-primary" : "btn btn-ghost"} style={{ fontSize: 13, padding: "6px 14px" }}>{p}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>{t("admin", "loading") || "Loading…"}</div>}

      {isEmpty && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {t("admin", "revenue.emptyState.noSessions") || "No table sessions have been synced yet."}
          </div>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 20, maxWidth: 460, margin: "0 auto 20px" }}>
            {t("admin", "revenue.emptyState.goToInvu") || "Go to INVU Integration to trigger your first sync."}
          </p>
          <Link href="/admin/integrations/invu" className="btn btn-primary">
            {t("admin", "revenue.emptyState.invuButton") || "Go to INVU Integration"}
          </Link>
        </div>
      )}

      {!loading && data && (
        <>
          {data.pendingReviewSessions.length > 0 && (
            <Section title={t("admin", "revenue.review.pendingSessions") || "Low-Confidence Sessions (Pending Review)"} count={data.pendingReviewSessions.length} accent="#fef9ec">
              {data.pendingReviewSessions.map((s) => {
                const tb = trustBadge(s.trustScore);
                const stakeAmount = s.allocations.reduce((sum, a) => sum + a.amountCents, 0);
                return (
                  <ReviewRow
                    key={s.id}
                    left={
                      <>
                        <TrustPill score={s.trustScore} />
                        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{s.reservation?.confirmationCode || s.id.slice(0, 10)}</span>
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{s.venue.name}</span>
                        <StatusChip status={s.matchMethod.toLowerCase()} label={s.matchMethod} size="xs" />
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>at stake: {fmt(stakeAmount)}</span>
                        <SourceLabel invu={s.matchMethod !== "UNMATCHED"} t={t} />
                      </>
                    }
                    actions={
                      <>
                        <button
                          onClick={() => doSessionAction(s.id, "accept")}
                          disabled={actionLoading === s.id}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: "3px 10px", color: "#1b5e20" }}
                        >
                          {t("admin", "revenue.review.acceptMatch") || "Accept Match"}
                        </button>
                        <button
                          onClick={() => { setNoteModal({ sessionId: s.id, action: "dispute" }); setNoteText(""); }}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: "3px 10px", color: "#991b1b" }}
                        >
                          {t("admin", "revenue.review.dispute") || "Dispute"}
                        </button>
                        <button
                          onClick={() => { setNoteModal({ sessionId: s.id, action: "dismiss" }); setNoteText(""); }}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: "3px 10px" }}
                        >
                          {t("admin", "revenue.review.dismiss") || "Dismiss"}
                        </button>
                      </>
                    }
                  />
                );
              })}
            </Section>
          )}

          {data.disputedAllocations.length > 0 && (
            <Section title={t("admin", "revenue.review.disputedAllocations") || "Disputed Commission Allocations"} count={data.disputedAllocations.length} accent="#fef2f2">
              {data.disputedAllocations.map((a) => (
                <ReviewRow
                  key={a.id}
                  left={
                    <>
                      <TrustPill score={a.tableSession.trustScore} />
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{a.tableSession.reservation?.confirmationCode || a.tableSession.id.slice(0, 10)}</span>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{a.tableSession.venue.name}</span>
                      <StatusChip status="disputed" label="Disputed" size="xs" />
                      <span style={{ fontSize: 12 }}>{a.earnerType} — {fmt(a.amountCents)}</span>
                      <SourceLabel invu={a.tableSession.matchMethod !== "UNMATCHED"} t={t} />
                    </>
                  }
                  actions={null}
                />
              ))}
            </Section>
          )}

          {data.reversedPaidAllocations.length > 0 && (
            <Section title={t("admin", "revenue.review.reversedPaid") || "Reversals on Paid Allocations — Needs Acknowledgment"} count={data.reversedPaidAllocations.length} accent="#fef2f2">
              {data.reversedPaidAllocations.map((a) => (
                <ReviewRow
                  key={a.id}
                  left={
                    <>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{a.tableSession.reservation?.confirmationCode || a.tableSession.id.slice(0, 10)}</span>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{a.tableSession.venue.name}</span>
                      <StatusChip status="reversed" label="Reversed" size="xs" />
                      <span style={{ fontSize: 12 }}>{a.earnerType} — {fmt(a.amountCents)}</span>
                    </>
                  }
                  actions={null}
                />
              ))}
            </Section>
          )}

          {data.fullCompSessions.length > 0 && (
            <Section title={t("admin", "revenue.review.fullComp") || "Full-Comp Sessions (Zero Commissionable Base)"} count={data.fullCompSessions.length} accent="#e3f2fd">
              {data.fullCompSessions.map((s) => (
                <ReviewRow
                  key={s.id}
                  left={
                    <>
                      <TrustPill score={s.trustScore} />
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{s.reservation?.confirmationCode || s.id.slice(0, 10)}</span>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{s.venue.name}</span>
                      <span style={{ fontSize: 12 }}>Gross: {fmt(s.grossCents)} · Comm: {fmt(s.commissionableCents)}</span>
                    </>
                  }
                  actions={
                    <button
                      onClick={() => doSessionAction(s.id, "accept")}
                      disabled={actionLoading === s.id}
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "3px 10px" }}
                    >
                      {t("admin", "revenue.review.acknowledge") || "Acknowledge"}
                    </button>
                  }
                />
              ))}
            </Section>
          )}
        </>
      )}

      {noteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ padding: 28, maxWidth: 420, width: "90%" }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-heading)" }}>
              {noteModal.action === "dispute" ? (t("admin", "revenue.review.disputeTitle") || "Dispute Session") : (t("admin", "revenue.review.dismissTitle") || "Dismiss Review Item")}
            </h3>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t("admin", "revenue.review.notePlaceholder") || "Note…"}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13, minHeight: 80, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => { setNoteModal(null); setNoteText(""); }} className="btn btn-ghost">{t("admin", "cancel") || "Cancel"}</button>
              <button onClick={() => doSessionAction(noteModal.sessionId, noteModal.action, noteText)} className="btn btn-primary">
                {t("admin", "confirm") || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, accent, children }: { title: string; count: number; accent?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", background: accent ?? "var(--color-layer-2, #f9f9f9)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 12, background: "rgba(0,0,0,0.08)", borderRadius: 12, padding: "2px 8px" }}>{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function ReviewRow({ left, actions }: { left: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid var(--color-border)", flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{left}</div>
      {actions && <div style={{ display: "flex", gap: 6 }}>{actions}</div>}
    </div>
  );
}

function TrustPill({ score }: { score: number }) {
  const tb = trustBadge(score);
  return (
    <span style={{ padding: "2px 8px", borderRadius: 12, background: tb.bg, color: tb.color, fontSize: 11, fontWeight: 700 }}>{tb.label}</span>
  );
}

function SourceLabel({ invu, t }: { invu: boolean; t: Function }) {
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: invu ? "#e3f2fd" : "#f3f4f6", color: invu ? "#0d47a1" : "#6b7280", fontWeight: 600 }}>
      {invu ? (t("admin", "revenue.sourceLabel.invuVerified") || "INVU-Verified") : (t("admin", "revenue.sourceLabel.manual") || "Manual Entry")}
    </span>
  );
}
