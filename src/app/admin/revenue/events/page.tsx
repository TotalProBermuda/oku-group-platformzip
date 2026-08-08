"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface TableSession {
  id: string;
  grossCents: number;
  commissionableCents: number;
  matchMethod: string;
  status: string;
  venue: { id: string; name: string };
  reservation: {
    id: string;
    confirmationCode: string;
    partySize: number;
  } | null;
  allocations: Array<{ id: string; earnerType: string; amountCents: number; status: string }>;
}

interface EventBucket {
  key: string;
  label: string;
  sessionCount: number;
  seatedCovers: number;
  grossCents: number;
  commissionableCents: number;
  referrerCents: number;
  hostCents: number;
  partnerCents: number;
  hasPendingReview: boolean;
  hasDisputed: boolean;
}

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
}

export default function EventAttributionPage() {
  const t = useTranslation();
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("30d");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/admin/revenue/events?preset=${preset}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setSessions(d.data); })
      .finally(() => setLoading(false));
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const buckets: EventBucket[] = [];
  const unlinked: TableSession[] = [];
  const unmatched: TableSession[] = [];

  for (const s of sessions) {
    if (s.matchMethod === "UNMATCHED" || !s.reservation) {
      unmatched.push(s);
    } else {
      unlinked.push(s);
    }
  }

  const makeBucket = (key: string, label: string, list: TableSession[]): EventBucket => {
    return {
      key,
      label,
      sessionCount: list.length,
      seatedCovers: list.reduce((sum, s) => sum + (s.reservation?.partySize ?? 0), 0),
      grossCents: list.reduce((sum, s) => sum + s.grossCents, 0),
      commissionableCents: list.reduce((sum, s) => sum + s.commissionableCents, 0),
      referrerCents: list.reduce((sum, s) => sum + s.allocations.filter((a) => a.earnerType === "REFERRER").reduce((a, b) => a + b.amountCents, 0), 0),
      hostCents: list.reduce((sum, s) => sum + s.allocations.filter((a) => a.earnerType === "HOST").reduce((a, b) => a + b.amountCents, 0), 0),
      partnerCents: list.reduce((sum, s) => sum + s.allocations.filter((a) => a.earnerType === "PARTNER").reduce((a, b) => a + b.amountCents, 0), 0),
      hasPendingReview: list.some((s) => s.status === "PENDING_REVIEW"),
      hasDisputed: list.some((s) => s.allocations.some((a) => a.status === "DISPUTED")),
    };
  };

  if (unlinked.length > 0) buckets.push(makeBucket("unlinked", t("admin", "revenue.sourceLabel.unlinked") || "Unlinked Revenue", unlinked));
  if (unmatched.length > 0) buckets.push(makeBucket("unmatched", t("admin", "revenue.events.unmatchedSessions") || "Unmatched Sessions", unmatched));

  const isEmpty = !loading && buckets.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 500, margin: 0 }}>
            {t("admin", "revenue.events.title") || "Event Attribution"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
            {t("admin", "revenue.events.subtitle") || "Revenue grouped by event session, with Unlinked and Unmatched buckets"}
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

      {!loading && buckets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {buckets.map((b) => (
            <div key={b.key} className="card" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{b.label}</span>
                  {b.hasPendingReview && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#fef9ec", color: "#92700a", fontWeight: 700 }}>
                      ⚠ {t("admin", "revenue.events.pendingReview") || "Pending Review"}
                    </span>
                  )}
                  {b.hasDisputed && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#fef2f2", color: "#991b1b", fontWeight: 700 }}>
                      ⚑ {t("admin", "revenue.events.disputed") || "Disputed"}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{b.sessionCount} {t("admin", "revenue.events.sessions") || "sessions"}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
                <StatBlock label={t("admin", "revenue.events.seatedCovers") || "Seated Covers"} value={b.seatedCovers.toString()} />
                <StatBlock label={t("admin", "revenue.dashboard.grossRevenue") || "Gross Revenue"} value={fmt(b.grossCents)} />
                <StatBlock label={t("admin", "revenue.dashboard.netCommissionable") || "Comm. Base"} value={fmt(b.commissionableCents)} />
                <StatBlock label={t("admin", "revenue.events.referrerTotal") || "Referrer Obligations"} value={fmt(b.referrerCents)} accent="#0d47a1" />
                <StatBlock label={t("admin", "revenue.events.hostTotal") || "Host Obligations"} value={fmt(b.hostCents)} accent="#1b5e20" />
                <StatBlock label={t("admin", "revenue.events.partnerTotal") || "Partner Obligations"} value={fmt(b.partnerCents)} accent="#6b21a8" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: accent ?? "var(--color-text-muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? "var(--color-text)" }}>
        {value}
      </div>
    </div>
  );
}
