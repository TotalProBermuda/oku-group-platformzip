"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

/**
 * ONE shared referrals feed, rendered identically on every referrer surface
 * (generic referrer, influencer, partner). It reads the projected rows from
 * the single server source `getMyReferrals`, so all referrer types see the
 * same live list and history split — never a per-surface fork. Money fields
 * (guest spend, commission, paid state) are optional: rows render cleanly
 * when they are null/absent.
 *
 * The component self-fetches from a shared endpoint (`/api/v1/me/referrals` by
 * default) and polls on an interval, so host status changes propagate live on
 * every surface without each page wiring its own refresh. An optional `data`
 * prop seeds first paint (e.g. from a dashboard payload) to avoid a flash.
 */

/**
 * Phase-1 commission state. There is NO canonical "paid" until the Phase-2
 * payout-ledger bridge (`LedgerEntry`/`PayoutBatch`) ships, so this never
 * reports paid — see `ReferralCommissionState` in the server source.
 */
export type ReferralCommissionState = "PENDING_CLOSE" | "ACCRUED_AWAITING_LEDGER";

/**
 * REFERRAL vs HOST_OP. A HOST_OP row is the viewer's own walk-in/check-in with
 * no external referrer — it is shown for completeness but tagged so it is never
 * mistaken for referral proof (Task #140, item 4). Optional so older payloads
 * without the field still render (treated as REFERRAL).
 */
export type ReferralAttributionKind = "REFERRAL" | "HOST_OP";

export type MyReferralRow = {
  attributionSessionId: string;
  reservationId: string;
  guestName: string;
  partySize: number;
  reservationDate: string;
  reservationStatus: string;
  attributionKind?: ReferralAttributionKind;
  money: {
    contributionCents: number | null;
    commissionCents: number | null;
    commissionState: ReferralCommissionState;
  };
};

export type MyReferralsData = {
  active: MyReferralRow[];
  history: MyReferralRow[];
  rollups: {
    activeCount: number;
    historyCount: number;
    /** Accrued (non-reversed) commission — NOT a paid figure. */
    commissionPendingCents: number;
    /** Whether a canonical paid rollup is available. Always false in Phase 1. */
    paidLedgerAvailable: boolean;
  };
};

const fmt = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const KNOWN_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "ACKNOWLEDGED",
  "WAITLISTED",
  "ARRIVED",
  "SEATED",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
]);

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#a78bfa",
  CONFIRMED: "#34d399",
  ACKNOWLEDGED: "#34d399",
  WAITLISTED: "#60a5fa",
  ARRIVED: "#fbbf24",
  SEATED: "#10b981",
  COMPLETED: "#10b981",
  NO_SHOW: "#9ca3af",
  CANCELLED: "#f87171",
};

function Row({
  row,
  t,
  locale,
}: {
  row: MyReferralRow;
  t: (ns: string, key: string) => string;
  locale?: string;
}) {
  const statusLabel = KNOWN_STATUSES.has(row.reservationStatus)
    ? t("referrals", `status_${row.reservationStatus}`)
    : row.reservationStatus;
  const color = STATUS_COLOR[row.reservationStatus] ?? "#9ca3af";
  const when = new Date(row.reservationDate).toLocaleDateString(locale || undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const commission = row.money.commissionCents;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        borderBottom: "1px solid var(--color-border, #e5e7eb)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 160px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.guestName}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted, #6b7280)" }}>
          {when} · {t("referrals", "feedColParty")}: {row.partySize}
          {row.attributionKind === "HOST_OP" && (
            <>
              {" · "}
              <span style={{ fontStyle: "italic" }}>{t("referrals", "feedWalkInTag")}</span>
            </>
          )}
        </div>
      </div>

      <span style={{ fontSize: 12, fontWeight: 700, color }}>{statusLabel}</span>

      <div style={{ textAlign: "right", minWidth: 90 }}>
        {commission != null ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(commission)}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted, #6b7280)" }}>
              {t("referrals", "feedAwaitingLedger")}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--color-text-muted, #6b7280)" }}>
            {t("referrals", "feedMoneyPending")}
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_DATA: MyReferralsData = {
  active: [],
  history: [],
  rollups: { activeCount: 0, historyCount: 0, commissionPendingCents: 0, paidLedgerAvailable: false },
};

export function MyReferralsFeed({
  data: initialData,
  locale,
  endpoint = "/api/v1/me/referrals",
  pollMs = 20000,
}: {
  data?: MyReferralsData;
  locale?: string;
  endpoint?: string;
  pollMs?: number;
}) {
  const t = useTranslation();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [data, setData] = useState<MyReferralsData>(initialData ?? EMPTY_DATA);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    async function load() {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as MyReferralsData;
        if (alive.current && json && Array.isArray(json.active)) setData(json);
      } catch {
        /* keep last-good data on transient failure */
      }
    }
    load();
    const id = pollMs > 0 ? setInterval(load, pollMs) : undefined;
    return () => {
      alive.current = false;
      if (id) clearInterval(id);
    };
  }, [endpoint, pollMs]);

  const rows = tab === "active" ? data.active : data.history;
  const emptyKey = tab === "active" ? "feedEmptyActive" : "feedEmptyHistory";

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: "0.02em" }}>
          {t("referrals", "feedTitle")}
        </h2>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-muted, #6b7280)" }}>
          <span>{t("referrals", "feedRollupActive")}: <strong>{data.rollups.activeCount}</strong></span>
          <span>{t("referrals", "feedRollupCommission")}: <strong>{fmt(data.rollups.commissionPendingCents)}</strong></span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {(["active", "history"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid var(--color-border, #e5e7eb)",
              background: tab === k ? "rgba(200,169,110,0.15)" : "transparent",
              color: tab === k ? "var(--color-text, #111)" : "var(--color-text-muted, #6b7280)",
              fontWeight: tab === k ? 700 : 500,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {k === "active"
              ? `${t("referrals", "feedActiveTab")} (${data.rollups.activeCount})`
              : `${t("referrals", "feedHistoryTab")} (${data.rollups.historyCount})`}
          </button>
        ))}
      </div>

      <div
        style={{
          background: "var(--layer-1, #fff)",
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {rows.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--color-text-muted, #6b7280)", fontSize: 13 }}>
            {t("referrals", emptyKey)}
          </div>
        ) : tab === "history" ? (() => {
          const inService = rows.filter((r) => r.reservationStatus === "ARRIVED" || r.reservationStatus === "SEATED");
          const pastAwaiting = rows.filter(
            (r) => !["COMPLETED", "CANCELLED", "NO_SHOW", "ARRIVED", "SEATED"].includes(r.reservationStatus)
          );
          const closed = rows.filter((r) => r.reservationStatus === "COMPLETED");
          const lost = rows.filter((r) => r.reservationStatus === "CANCELLED" || r.reservationStatus === "NO_SHOW");
          const sections: Array<{ key: string; label: string; items: MyReferralRow[] }> = [
            { key: "inService", label: t("referrals", "feedSectionInService"), items: inService },
            { key: "pastAwaiting", label: t("referrals", "feedSectionPastAwaitingClose"), items: pastAwaiting },
            { key: "closed", label: t("referrals", "feedSectionClosed"), items: closed },
            { key: "lost", label: t("referrals", "feedSectionLost"), items: lost },
          ];
          return sections
            .filter((s) => s.items.length > 0)
            .map((s) => (
              <div key={s.key}>
                <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted, #6b7280)", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                  {s.label}
                </div>
                {s.items.map((r) => <Row key={r.attributionSessionId} row={r} t={t} locale={locale} />)}
              </div>
            ));
        })() : (
          rows.map((r) => <Row key={r.attributionSessionId} row={r} t={t} locale={locale} />)
        )}
      </div>
    </section>
  );
}
