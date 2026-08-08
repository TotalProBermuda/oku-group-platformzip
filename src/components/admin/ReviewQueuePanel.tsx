"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface ReviewItem {
  id: string;
  venueId: string;
  issueType: string;
  status: string;
  confidenceScore: number | null;
  summary: string;
  tableSessionId: string | null;
  reservationId: string | null;
  createdAt: string;
  assignedToUserId: string | null;
}

interface Venue { id: string; name: string; }
interface Props { venues: Venue[]; }

const ISSUE_COLORS: Record<string, string> = {
  NO_MATCH: "#ef4444",
  LOW_CONFIDENCE_MATCH: "#f59e0b",
  MULTIPLE_MATCHES: "#f97316",
  PAYMENT_MISMATCH: "#8b5cf6",
  CREDIT_NOTE_AMBIGUITY: "#06b6d4",
  MISSING_TABLE: "#64748b",
  DUPLICATE_ORDER: "#ec4899",
  FULL_DISCOUNT: "#10b981",
  OTHER: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#f59e0b",
  IN_REVIEW: "#3b82f6",
  RESOLVED: "#10b981",
  REJECTED: "#6b7280",
};

export default function ReviewQueuePanel({ venues }: Props) {
  const t = useTranslation();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [venueFilter, setVenueFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [relinkModal, setRelinkModal] = useState<{ id: string; } | null>(null);
  const [relinkReservationId, setRelinkReservationId] = useState("");
  const [noteModal, setNoteModal] = useState<{ id: string; } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [resolveModal, setResolveModal] = useState<{ id: string; } | null>(null);
  const [resolveText, setResolveText] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (venueFilter) params.set("venueId", venueFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/v1/admin/integrations/invu/review-queue?${params}`);
      const json = await res.json();
      if (json.ok) { setItems(json.data); setTotal(json.total); }
    } finally {
      setLoading(false);
    }
  }, [page, venueFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const action = async (id: string, endpoint: string, body?: object) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/v1/admin/integrations/invu/review-queue/${id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (json.ok) {
        setMsg({ text: t("admin", "invu.reviewQueue.actionCompleted") });
        load();
      } else {
        setMsg({ text: json.error ?? "Error", error: true });
      }
    } finally {
      setActionLoading(null);
    }
  };

  const card: React.CSSProperties = {
    background: "var(--layer-1)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    padding: "24px",
    marginBottom: 16,
  };

  const btnStyle = (color: string): React.CSSProperties => ({
    background: color,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 11,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 4 }}>
        {t("admin", "invu.reviewQueue.title")}
      </h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 24 }}>
        {t("admin", "invu.reviewQueue.subtitle")}
      </p>

      {msg && (
        <div style={{
          background: msg.error ? "#ef4444" : "#10b981",
          color: "#fff",
          borderRadius: 8,
          padding: "10px 16px",
          marginBottom: 16,
          fontSize: 13,
        }}>
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...card, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={venueFilter}
          onChange={(e) => { setVenueFilter(e.target.value); setPage(1); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", fontSize: 13 }}
        >
          <option value="">{t("admin", "invu.reviewQueue.allVenues")}</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", fontSize: 13 }}
        >
          <option value="">{t("admin", "invu.reviewQueue.allStatuses")}</option>
          <option value="OPEN">{t("admin", "invu.reviewQueue.statusOpen")}</option>
          <option value="IN_REVIEW">{t("admin", "invu.reviewQueue.statusInReview")}</option>
          <option value="RESOLVED">{t("admin", "invu.reviewQueue.statusResolved")}</option>
          <option value="REJECTED">{t("admin", "invu.reviewQueue.statusRejected")}</option>
        </select>

        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {total !== 1
            ? t("admin", "invu.reviewQueue.totalItemsCountPlural", { count: total })
            : t("admin", "invu.reviewQueue.totalItemsCount", { count: total })}
        </span>
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>{t("admin", "invu.reviewQueue.loading")}</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>{t("admin", "invu.reviewQueue.noItems")}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--layer-2)" }}>
                  {[
                    t("admin", "invu.reviewQueue.issueType"),
                    t("admin", "invu.reviewQueue.summary"),
                    t("admin", "invu.reviewQueue.venue"),
                    t("admin", "invu.reviewQueue.sessionId"),
                    t("admin", "invu.reviewQueue.reservationId"),
                    t("admin", "invu.reviewQueue.confidence"),
                    t("admin", "invu.reviewQueue.createdAt"),
                    t("admin", "invu.reviewQueue.assignedTo"),
                    t("admin", "invu.reviewQueue.status"),
                    t("admin", "invu.reviewQueue.actions"),
                  ].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid rgba(128,128,128,0.1)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: ISSUE_COLORS[item.issueType] + "22", color: ISSUE_COLORS[item.issueType], padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        {item.issueType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.summary}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 10 }}>
                      {venues.find((v) => v.id === item.venueId)?.name ?? item.venueId.slice(-8)}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 10 }}>
                      {item.tableSessionId ? item.tableSessionId.slice(-8) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 10 }}>
                      {item.reservationId ? item.reservationId.slice(-8) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {item.confidenceScore !== null ? (
                        <span style={{
                          color: (item.confidenceScore ?? 0) >= 0.75 ? "#10b981" : (item.confidenceScore ?? 0) >= 0.5 ? "#f59e0b" : "#ef4444",
                          fontWeight: 600,
                        }}>
                          {((item.confidenceScore ?? 0) * 100).toFixed(0)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 10 }}>
                      {item.assignedToUserId
                        ? item.assignedToUserId.slice(-8)
                        : <span style={{ color: "var(--color-text-muted)" }}>{t("admin", "invu.reviewQueue.unassigned")}</span>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: STATUS_COLORS[item.status] + "22", color: STATUS_COLORS[item.status], padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {item.status === "OPEN" || item.status === "IN_REVIEW" ? (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <button
                            disabled={actionLoading === item.id}
                            onClick={() => action(item.id, "approve")}
                            style={btnStyle("#10b981")}
                          >
                            {t("admin", "invu.reviewQueue.approve")}
                          </button>
                          <button
                            disabled={actionLoading === item.id}
                            onClick={() => { setResolveModal({ id: item.id }); setResolveText(""); }}
                            style={btnStyle("#6366f1")}
                          >
                            {t("admin", "invu.reviewQueue.resolveAnomaly")}
                          </button>
                          <button
                            disabled={actionLoading === item.id}
                            onClick={() => action(item.id, "mark-no-commission")}
                            style={btnStyle("#f59e0b")}
                          >
                            {t("admin", "invu.reviewQueue.markNoCommission")}
                          </button>
                          <button
                            disabled={actionLoading === item.id}
                            onClick={() => setRelinkModal({ id: item.id })}
                            style={btnStyle("#3b82f6")}
                          >
                            {t("admin", "invu.reviewQueue.relink")}
                          </button>
                          <button
                            disabled={actionLoading === item.id}
                            onClick={() => { setNoteModal({ id: item.id }); setNoteText(""); }}
                            style={btnStyle("#64748b")}
                          >
                            {t("admin", "invu.reviewQueue.addInternalNote")}
                          </button>
                          <button
                            disabled={actionLoading === item.id}
                            onClick={() => action(item.id, "reject")}
                            style={btnStyle("#6b7280")}
                          >
                            {t("admin", "invu.reviewQueue.reject")}
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", cursor: "pointer" }}
          >
            {t("admin", "invu.reviewQueue.previous")}
          </button>
          <span style={{ padding: "6px 14px", fontSize: 13 }}>{page}</span>
          <button
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", cursor: "pointer" }}
          >
            {t("admin", "invu.reviewQueue.next")}
          </button>
        </div>
      )}

      {/* Relink Modal */}
      {relinkModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--layer-1)", borderRadius: 12, padding: 28, width: 400, maxWidth: "90vw" }}>
            <h3 style={{ marginBottom: 16 }}>{t("admin", "invu.reviewQueue.relinkTitle")}</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>{t("admin", "invu.reviewQueue.relinkSubtitle")}</p>
            <input
              value={relinkReservationId}
              onChange={(e) => setRelinkReservationId(e.target.value)}
              placeholder={t("admin", "invu.reviewQueue.reservationId")}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setRelinkModal(null); setRelinkReservationId(""); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", cursor: "pointer" }}
              >
                {t("admin", "invu.reviewQueue.cancel")}
              </button>
              <button
                disabled={!relinkReservationId.trim()}
                onClick={async () => {
                  await action(relinkModal.id, "manual-link", { reservationId: relinkReservationId.trim() });
                  setRelinkModal(null);
                  setRelinkReservationId("");
                }}
                style={{ padding: "8px 16px", borderRadius: 8, background: "#c41e3a", color: "#fff", border: "none", cursor: "pointer" }}
              >
                {t("admin", "invu.reviewQueue.link")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {noteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--layer-1)", borderRadius: 12, padding: 28, width: 440, maxWidth: "90vw" }}>
            <h3 style={{ marginBottom: 16 }}>{t("admin", "invu.reviewQueue.addNoteTitle")}</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>{t("admin", "invu.reviewQueue.addNoteSubtitle")}</p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t("admin", "invu.reviewQueue.addInternalNote")}
              rows={4}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", fontSize: 13, marginBottom: 16, boxSizing: "border-box", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setNoteModal(null); setNoteText(""); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", cursor: "pointer" }}
              >
                {t("admin", "invu.reviewQueue.cancel")}
              </button>
              <button
                disabled={!noteText.trim()}
                onClick={async () => {
                  await action(noteModal.id, "add-note", { note: noteText.trim() });
                  setNoteModal(null);
                  setNoteText("");
                }}
                style={{ padding: "8px 16px", borderRadius: 8, background: "#64748b", color: "#fff", border: "none", cursor: "pointer" }}
              >
                {t("admin", "invu.reviewQueue.saveNote")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Anomaly Modal */}
      {resolveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--layer-1)", borderRadius: 12, padding: 28, width: 440, maxWidth: "90vw" }}>
            <h3 style={{ marginBottom: 16 }}>{t("admin", "invu.reviewQueue.resolveTitle")}</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>{t("admin", "invu.reviewQueue.resolveSubtitle")}</p>
            <textarea
              value={resolveText}
              onChange={(e) => setResolveText(e.target.value)}
              placeholder={t("admin", "invu.reviewQueue.resolveAnomaly")}
              rows={3}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", fontSize: 13, marginBottom: 16, boxSizing: "border-box", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setResolveModal(null); setResolveText(""); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", cursor: "pointer" }}
              >
                {t("admin", "invu.reviewQueue.cancel")}
              </button>
              <button
                onClick={async () => {
                  await action(resolveModal.id, "resolve-anomaly", { resolution: resolveText.trim() || undefined });
                  setResolveModal(null);
                  setResolveText("");
                }}
                style={{ padding: "8px 16px", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer" }}
              >
                {t("admin", "invu.reviewQueue.resolve")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
