"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface AnchorSession {
  id: string;
  source: string;
  status: string;
  anchorStatus: "PENDING_ATTRIBUTION" | "FAILED_REVIEW";
  anchorRetryCount: number;
  anchorLastError: string | null;
  anchorLastAttemptAt: string | null;
  anchorResolvedAt: string | null;
  openedAt: string;
  reservationId: string | null;
  referralActorId: string | null;
  legacyReferrerId: string | null;
  referralLinkId: string | null;
  bookingCode: string;
  referralActor: { id: string; displayName: string; actorType: string } | null;
  legacyReferrer: { id: string; fullName: string; referrerType: string } | null;
  reservation: {
    id: string;
    contactName: string;
    partySize: number;
    reservationDate: string;
    conceptRequested: string | null;
  } | null;
}

function StatusBadge({ status, t }: { status: "PENDING_ATTRIBUTION" | "FAILED_REVIEW"; t: ReturnType<typeof useTranslation> }) {
  if (status === "PENDING_ATTRIBUTION") {
    return (
      <span style={{
        background: "#fef9ec", color: "#92700a",
        padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
      }}>
        {t("admin", "anchorStatus_pending")}
      </span>
    );
  }
  return (
    <span style={{
      background: "#fef2f2", color: "#991b1b",
      padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
    }}>
      {t("admin", "anchorStatus_failedReview")}
    </span>
  );
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AttributionAnchorPage() {
  const t = useTranslation();
  const [sessions, setSessions] = useState<AnchorSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING_ATTRIBUTION" | "FAILED_REVIEW">("all");
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/attribution-anchor?status=${statusFilter}&limit=100`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: "retry" | "resolve", sessionId: string) {
    setActing(sessionId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/attribution-anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, attributionSessionId: sessionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? res.statusText);
      }
      setSuccess(action === "retry"
        ? t("admin", "anchorRetryEnqueued")
        : t("admin", "anchorResolved")
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1614", marginBottom: 4 }}>
          {t("admin", "anchorReviewTitle")}
        </h1>
        <p style={{ fontSize: 14, color: "#7c7168", margin: 0 }}>
          {t("admin", "anchorReviewDescription")}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["all", "PENDING_ATTRIBUTION", "FAILED_REVIEW"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setStatusFilter(v)}
            style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
              border: "1px solid",
              borderColor: statusFilter === v ? "#c41e3a" : "#e8e4e0",
              background: statusFilter === v ? "#c41e3a" : "#fff",
              color: statusFilter === v ? "#fff" : "#4b4540",
              cursor: "pointer",
            }}
          >
            {v === "all"
              ? t("admin", "allStatuses")
              : v === "PENDING_ATTRIBUTION"
              ? t("admin", "anchorStatus_pending")
              : t("admin", "anchorStatus_failedReview")}
          </button>
        ))}
        <button
          onClick={load}
          style={{
            marginLeft: "auto", padding: "6px 16px", borderRadius: 8, fontSize: 13,
            background: "#f3f0ec", border: "1px solid #e8e4e0", color: "#4b4540", cursor: "pointer",
          }}
        >
          {t("admin", "refresh")}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", color: "#991b1b", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#e8f5e9", color: "#1b5e20", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {success}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#9ca3af", padding: "40px 0", textAlign: "center" }}>
          {t("admin", "loading")}
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ color: "#9ca3af", padding: "40px 0", textAlign: "center" }}>
          {t("admin", "anchorNoSessions")}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12, fontSize: 13, color: "#7c7168" }}>
            {total} {t("admin", "anchorSessionsTotal")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sessions.map((s) => (
              <div key={s.id} style={{
                background: "#fff", border: "1px solid #e8e4e0", borderRadius: 12,
                padding: "20px 24px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <StatusBadge status={s.anchorStatus} t={t} />
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: "#1a1614", fontWeight: 600 }}>
                    {s.bookingCode}
                  </span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{s.source}</span>
                  <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>
                    {t("admin", "anchorOpenedAt")}: {fmt(s.openedAt)}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px 24px", marginBottom: 14 }}>
                  <div>
                    <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {t("admin", "anchorReferrer")}
                    </span>
                    <div style={{ fontSize: 14, color: "#1a1614" }}>
                      {s.referralActor?.displayName ?? s.legacyReferrer?.fullName ?? "—"}
                      {s.referralActor && (
                        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                          ({s.referralActor.actorType})
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {t("admin", "anchorGuest")}
                    </span>
                    <div style={{ fontSize: 14, color: "#1a1614" }}>
                      {s.reservation?.contactName ?? "—"}
                      {s.reservation && (
                        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 6 }}>
                          {s.reservation.partySize}px · {new Date(s.reservation.reservationDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {t("admin", "anchorRetries")}
                    </span>
                    <div style={{ fontSize: 14, color: "#1a1614" }}>
                      {s.anchorRetryCount}
                      {s.anchorLastAttemptAt && (
                        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 6 }}>
                          {t("admin", "anchorLastAttempt")}: {fmt(s.anchorLastAttemptAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  {s.anchorLastError && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {t("admin", "anchorLastError")}
                      </span>
                      <div style={{
                        fontSize: 12, color: "#991b1b", background: "#fef2f2",
                        borderRadius: 6, padding: "4px 8px", marginTop: 2, fontFamily: "monospace",
                        wordBreak: "break-word",
                      }}>
                        {s.anchorLastError}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {s.anchorStatus === "PENDING_ATTRIBUTION" && (
                    <button
                      disabled={acting === s.id}
                      onClick={() => doAction("retry", s.id)}
                      style={{
                        padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: "#c41e3a", color: "#fff", border: "none", cursor: "pointer",
                        opacity: acting === s.id ? 0.5 : 1,
                      }}
                    >
                      {acting === s.id ? t("admin", "loading") : t("admin", "anchorRetryNow")}
                    </button>
                  )}
                  {s.anchorStatus === "FAILED_REVIEW" && (s.referralActorId || s.legacyReferrerId) && (
                    <button
                      disabled={acting === s.id}
                      onClick={() => doAction("resolve", s.id)}
                      style={{
                        padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: "#1b5e20", color: "#fff", border: "none", cursor: "pointer",
                        opacity: acting === s.id ? 0.5 : 1,
                      }}
                    >
                      {acting === s.id ? t("admin", "loading") : t("admin", "anchorManualResolve")}
                    </button>
                  )}
                  {s.reservationId && (
                    <a
                      href={`/admin/reservations/${s.reservationId}`}
                      style={{
                        padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                        background: "#f3f0ec", color: "#4b4540", border: "1px solid #e8e4e0",
                        textDecoration: "none",
                      }}
                    >
                      {t("admin", "anchorViewReservation")}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
