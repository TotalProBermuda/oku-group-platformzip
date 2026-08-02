"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import StatusChip from "@/components/ui/StatusChip";

interface Allocation {
  id: string;
  earnerType: string;
  earnerRefId: string;
  amountCents: number;
  status: string;
  tableSession: {
    id: string;
    grossCents: number;
    commissionableCents: number;
    closedAt: string | null;
    reservation: { id: string; confirmationCode: string } | null;
  };
}

interface EarnerGroup {
  earnerType: string;
  earnerRefId: string;
  allocations: Allocation[];
  totalGrossCents: number;
  totalCommissionableCents: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  disputedCount: number;
  reversedCount: number;
}

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function ObligationsPage() {
  const t = useTranslation();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("30d");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modal, setModal] = useState<{ type: "dispute" | "reverse"; allocationId: string } | null>(null);
  const [modalNote, setModalNote] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/admin/revenue/obligations?preset=${preset}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setAllocations(d.data); })
      .finally(() => setLoading(false));
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const groups: EarnerGroup[] = [];
  const keyMap = new Map<string, EarnerGroup>();

  for (const a of allocations) {
    const key = `${a.earnerType}::${a.earnerRefId}`;
    if (!keyMap.has(key)) {
      const g: EarnerGroup = {
        earnerType: a.earnerType,
        earnerRefId: a.earnerRefId,
        allocations: [],
        totalGrossCents: 0,
        totalCommissionableCents: 0,
        pendingCents: 0,
        approvedCents: 0,
        paidCents: 0,
        disputedCount: 0,
        reversedCount: 0,
      };
      keyMap.set(key, g);
      groups.push(g);
    }
    const g = keyMap.get(key)!;
    g.allocations.push(a);
    g.totalGrossCents += a.tableSession.grossCents;
    g.totalCommissionableCents += a.tableSession.commissionableCents;
    if (a.status === "PENDING") g.pendingCents += a.amountCents;
    else if (a.status === "APPROVED") g.approvedCents += a.amountCents;
    else if (a.status === "PAID") g.paidCents += a.amountCents;
    else if (a.status === "DISPUTED") g.disputedCount++;
    else if (a.status === "REVERSED") g.reversedCount++;
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const doAction = async (allocationId: string, action: "approve" | "mark-paid" | "dispute" | "reverse", note?: string) => {
    setActionLoading(allocationId);
    try {
      await fetch(`/api/v1/admin/revenue/allocations/${allocationId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, adjustmentNote: note }),
      });
      load();
    } finally {
      setActionLoading(null);
      setModal(null);
      setModalNote("");
    }
  };

  const isEmpty = !loading && allocations.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 500, margin: 0 }}>
            {t("admin", "revenue.obligations.title") || "Commission Obligations"}
          </h1>
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
          <p style={{ color: "var(--color-text-muted)", marginBottom: 20, maxWidth: 420, margin: "0 auto 20px" }}>
            {t("admin", "revenue.emptyState.goToInvu") || "Go to INVU Integration to trigger your first sync."}
          </p>
          <Link href="/admin/integrations/invu" className="btn btn-primary">
            {t("admin", "revenue.emptyState.invuButton") || "Go to INVU Integration"}
          </Link>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => {
            const key = `${g.earnerType}::${g.earnerRefId}`;
            const isOpen = expanded.has(key);
            return (
              <div key={key} className="card" style={{ overflow: "hidden" }}>
                <div
                  onClick={() => toggleExpand(key)}
                  style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <StatusChip status={g.earnerType.toLowerCase()} label={g.earnerType} size="xs" />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{g.earnerRefId.slice(0, 16)}…</span>
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{g.allocations.length} sessions</span>
                  </div>
                  <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
                    <div><span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>GROSS</span><br /><strong>{fmt(g.totalGrossCents)}</strong></div>
                    <div><span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>COMM. BASE</span><br /><strong>{fmt(g.totalCommissionableCents)}</strong></div>
                    <div><span style={{ color: "#92700a", fontSize: 11 }}>PENDING</span><br /><strong style={{ color: "#92700a" }}>{fmt(g.pendingCents)}</strong></div>
                    <div><span style={{ color: "#1b5e20", fontSize: 11 }}>PAID</span><br /><strong style={{ color: "#1b5e20" }}>{fmt(g.paidCents)}</strong></div>
                    <div style={{ fontSize: 18, color: "var(--color-text-muted)" }}>{isOpen ? "▲" : "▼"}</div>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--color-border)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "var(--color-layer-2, #f9f9f9)" }}>
                          {["Reservation", "Gross", "Comm. Base", "Amount Owed", "Status", "Actions"].map((h) => (
                            <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.allocations.map((a) => (
                          <tr key={a.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "8px 16px" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                                {a.tableSession.reservation?.confirmationCode || a.tableSession.id.slice(0, 10)}…
                              </span>
                            </td>
                            <td style={{ padding: "8px 16px" }}>{fmt(a.tableSession.grossCents)}</td>
                            <td style={{ padding: "8px 16px" }}>{fmt(a.tableSession.commissionableCents)}</td>
                            <td style={{ padding: "8px 16px" }}>{fmt(a.amountCents)}</td>
                            <td style={{ padding: "8px 16px" }}><StatusChip status={a.status.toLowerCase()} label={a.status} size="xs" /></td>
                            <td style={{ padding: "8px 16px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                {a.status === "PENDING" && (
                                  <>
                                    <button
                                      onClick={() => doAction(a.id, "approve")}
                                      disabled={actionLoading === a.id}
                                      className="btn btn-ghost"
                                      style={{ fontSize: 12, padding: "3px 10px", color: "#1b5e20" }}
                                    >
                                      {t("admin", "approve") || "Approve"}
                                    </button>
                                    <button
                                      onClick={() => { setModal({ type: "dispute", allocationId: a.id }); setModalNote(""); }}
                                      className="btn btn-ghost"
                                      style={{ fontSize: 12, padding: "3px 10px", color: "#991b1b" }}
                                    >
                                      {t("admin", "revenue.obligations.dispute") || "Dispute"}
                                    </button>
                                  </>
                                )}
                                {a.status === "APPROVED" && (
                                  <button
                                    onClick={() => doAction(a.id, "mark-paid")}
                                    disabled={actionLoading === a.id}
                                    className="btn btn-ghost"
                                    style={{ fontSize: 12, padding: "3px 10px", color: "#1b5e20" }}
                                  >
                                    {t("admin", "revenue.obligations.markPaid") || "Mark Paid"}
                                  </button>
                                )}
                                {["PENDING", "APPROVED", "PAID"].includes(a.status) && (
                                  <button
                                    onClick={() => { setModal({ type: "reverse", allocationId: a.id }); setModalNote(""); }}
                                    className="btn btn-ghost"
                                    style={{ fontSize: 12, padding: "3px 10px", color: "#6b7280" }}
                                  >
                                    {t("admin", "revenue.obligations.reverse") || "Reverse"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ padding: 28, maxWidth: 420, width: "90%" }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-heading)" }}>
              {modal.type === "dispute" ? (t("admin", "revenue.obligations.disputeTitle") || "Dispute Allocation") : (t("admin", "revenue.obligations.reverseTitle") || "Reverse Allocation")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>
              {t("admin", "revenue.obligations.addNote") || "Add a note explaining this action:"}
            </p>
            <textarea
              value={modalNote}
              onChange={(e) => setModalNote(e.target.value)}
              placeholder={t("admin", "revenue.obligations.notePlaceholder") || "Internal note…"}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13, minHeight: 80, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => { setModal(null); setModalNote(""); }} className="btn btn-ghost">{t("admin", "cancel") || "Cancel"}</button>
              <button
                onClick={() => doAction(modal.allocationId, modal.type === "dispute" ? "dispute" : "reverse", modalNote)}
                className="btn btn-primary"
                style={{ background: modal.type === "dispute" ? "#991b1b" : undefined }}
              >
                {t("admin", "confirm") || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
