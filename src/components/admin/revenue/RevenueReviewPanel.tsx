"use client";
import { useEffect, useState, useCallback } from "react";

interface Venue {
  id: string;
  name: string;
}

interface BaseItem {
  trustScore: number;
  source: "INVU_VERIFIED" | "MANUAL";
  createdAt: string;
}

interface SessionItem extends BaseItem {
  kind: "PENDING_REVIEW_SESSION" | "FULL_COMP_SESSION";
  tableSessionId: string;
  matchMethod: string;
  venueName: string;
  reservationCode: string | null;
  contactName: string | null;
  grossCents: number;
  commissionableCents: number;
}

interface AllocationItem extends BaseItem {
  kind: "DISPUTED_ALLOCATION" | "REVERSED_AFTER_PAID_ALLOCATION";
  allocationId: string;
  tableSessionId: string;
  earnerType: string;
  earnerName: string;
  amountCents: number;
  venueName: string;
  reservationCode: string | null;
}

type Item = SessionItem | AllocationItem;

interface ReviewData {
  pendingReviewSessions: SessionItem[];
  fullCompSessions: SessionItem[];
  disputedAllocations: AllocationItem[];
  reversedPaidAllocations: AllocationItem[];
}

function cents(n: number): string {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function trustColor(score: number): string {
  if (score >= 0.95) return "#10b981";
  if (score >= 0.75) return "#f59e0b";
  return "#ef4444";
}

const KIND_LABEL: Record<Item["kind"], string> = {
  PENDING_REVIEW_SESSION: "Low-confidence match",
  FULL_COMP_SESSION: "Full-comp (no commissionable revenue)",
  DISPUTED_ALLOCATION: "Disputed allocation",
  REVERSED_AFTER_PAID_ALLOCATION: "Reversed after paid",
};

const SOURCE_LABEL: Record<BaseItem["source"], string> = {
  INVU_VERIFIED: "INVU-Verified",
  MANUAL: "Manual Entry",
};

export default function RevenueReviewPanel({ venues }: { venues: Venue[] }) {
  const [venueId, setVenueId] = useState<string>("");
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (venueId) params.set("venueId", venueId);
    fetch(`/api/v1/admin/revenue/review?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j.data);
        else setError(j.error ?? "Error");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function actOnSession(sessionId: string, action: "accept" | "dispute" | "dismiss") {
    setBusyId(sessionId);
    setToast("");
    try {
      const path =
        action === "dismiss"
          ? "dismiss-review"
          : action; // accept | dispute
      const res = await fetch(`/api/v1/admin/revenue/sessions/${sessionId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (j.ok) {
        setToast(`Session ${action} succeeded`);
        load();
      } else {
        setToast(`Failed: ${j.error ?? "unknown"}`);
      }
    } catch (e) {
      setToast(`Failed: ${String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  const items: Item[] = data
    ? [
        ...data.pendingReviewSessions,
        ...data.fullCompSessions,
        ...data.disputedAllocations,
        ...data.reversedPaidAllocations,
      ].sort((a, b) => a.trustScore - b.trustScore)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            marginBottom: 4,
          }}
        >
          Revenue
        </div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, margin: 0 }}>
          Financial Trust Review
        </h1>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4, marginBottom: 0 }}>
          Commission-level financial exceptions. For sync-anomaly review, use{" "}
          <a href="/admin/review-queue" style={{ color: "inherit", textDecoration: "underline" }}>
            Review Queue
          </a>
          .
        </p>
      </header>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          padding: 12,
          background: "var(--layer-1)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Venue</label>
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text)",
              minWidth: 180,
            }}
          >
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {toast && (
        <div
          style={{
            padding: "8px 12px",
            background: "var(--layer-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {toast}
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, color: "var(--color-text-muted)", fontSize: 13 }}>
          Loading review queue…
        </div>
      )}
      {error && (
        <div style={{ padding: 24, color: "#ef4444", fontSize: 13 }}>Error: {error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div
          style={{
            padding: "32px 24px",
            background: "var(--layer-1)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            color: "var(--color-text-muted)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          No items currently require financial review.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div
          style={{
            background: "var(--layer-1)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--layer-2)", textAlign: "left" }}>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Trust</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Issue</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Venue</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Reservation</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>At stake</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Source</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Created</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const id = "tableSessionId" in it ? it.tableSessionId : "";
                const amount = "amountCents" in it ? it.amountCents : it.grossCents;
                const isSession =
                  it.kind === "PENDING_REVIEW_SESSION" || it.kind === "FULL_COMP_SESSION";
                return (
                  <tr
                    key={`${it.kind}::${"allocationId" in it ? it.allocationId : it.tableSessionId}`}
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          background: trustColor(it.trustScore),
                          color: "#fff",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {it.trustScore.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{KIND_LABEL[it.kind]}</td>
                    <td style={{ padding: "10px 12px" }}>{it.venueName}</td>
                    <td style={{ padding: "10px 12px" }}>{it.reservationCode ?? "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{cents(amount)}</td>
                    <td style={{ padding: "10px 12px" }}>{SOURCE_LABEL[it.source]}</td>
                    <td style={{ padding: "10px 12px", color: "var(--color-text-muted)" }}>
                      {new Date(it.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {isSession ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            disabled={busyId === id}
                            onClick={() => actOnSession(id, "accept")}
                            style={btnStyle("#10b981")}
                          >
                            Accept
                          </button>
                          <button
                            disabled={busyId === id}
                            onClick={() => actOnSession(id, "dispute")}
                            style={btnStyle("#ef4444")}
                          >
                            Dispute
                          </button>
                          <button
                            disabled={busyId === id}
                            onClick={() => actOnSession(id, "dismiss")}
                            style={btnStyle("#64748b")}
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        <a
                          href={`/admin/revenue/sessions?focus=${id}`}
                          style={{
                            fontSize: 11,
                            color: "var(--color-text)",
                            textDecoration: "underline",
                          }}
                        >
                          Open session
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${color}`,
    background: "transparent",
    color,
    cursor: "pointer",
  };
}
