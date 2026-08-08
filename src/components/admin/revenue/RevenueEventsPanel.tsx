"use client";
import { useEffect, useState, useCallback } from "react";

interface Venue {
  id: string;
  name: string;
}

interface EventBucket {
  bucketKey: string;
  bucketLabel: string;
  bucketKind: "VENUE" | "UNLINKED_REVENUE" | "UNMATCHED_SESSIONS";
  venueName: string | null;
  sessionsCount: number;
  seatedCovers: number;
  grossCents: number;
  commissionableCents: number;
  referrerCents: number;
  hostCents: number;
  partnerCents: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  pendingReviewCount: number;
  disputedCount: number;
}

function cents(n: number): string {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BUCKET_LABEL: Record<EventBucket["bucketKind"], string> = {
  VENUE: "Restaurant Reservations",
  UNLINKED_REVENUE: "Unlinked Revenue",
  UNMATCHED_SESSIONS: "Unmatched Sessions",
};

const BUCKET_NOTE: Record<EventBucket["bucketKind"], string> = {
  VENUE: "Reservations with attribution chain.",
  UNLINKED_REVENUE: "Reservations without attribution data — not silently dropped.",
  UNMATCHED_SESSIONS: "Sessions with no reservation linked.",
};

export default function RevenueEventsPanel({ venues }: { venues: Venue[] }) {
  const [venueId, setVenueId] = useState<string>("");
  const [buckets, setBuckets] = useState<EventBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (venueId) params.set("venueId", venueId);
    fetch(`/api/v1/admin/revenue/events?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setBuckets(j.data);
        else setError(j.error ?? "Error");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

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
          Event Attribution
        </h1>
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

      {loading && (
        <div style={{ padding: 24, color: "var(--color-text-muted)", fontSize: 13 }}>
          Loading event attribution…
        </div>
      )}
      {error && <div style={{ padding: 24, color: "#ef4444", fontSize: 13 }}>Error: {error}</div>}

      {!loading && !error && buckets.length === 0 && (
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
          No event-level attribution data yet.
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {buckets.map((b) => {
          const labelPrefix =
            b.bucketKind === "VENUE" ? `${b.venueName ?? b.bucketLabel}` : BUCKET_LABEL[b.bucketKind];
          const showAnomaly = b.pendingReviewCount > 0 || b.disputedCount > 0;
          return (
            <div
              key={b.bucketKey}
              style={{
                background: "var(--layer-1)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
                    {labelPrefix}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
                      marginTop: 2,
                    }}
                  >
                    {BUCKET_NOTE[b.bucketKind]}
                  </div>
                </div>
                {showAnomaly && (
                  <span
                    style={{
                      padding: "2px 10px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 600,
                      background: "#fef3c7",
                      color: "#92400e",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.pendingReviewCount > 0 ? `${b.pendingReviewCount} review` : ""}
                    {b.pendingReviewCount > 0 && b.disputedCount > 0 ? " · " : ""}
                    {b.disputedCount > 0 ? `${b.disputedCount} disputed` : ""}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                }}
              >
                <Stat label="Sessions" value={String(b.sessionsCount)} />
                <Stat label="Seated covers" value={String(b.seatedCovers)} />
                <Stat label="Gross" value={cents(b.grossCents)} />
                <Stat label="Commissionable" value={cents(b.commissionableCents)} />
                <Stat label="Referrer" value={cents(b.referrerCents)} />
                <Stat label="Host" value={cents(b.hostCents)} />
                <Stat label="Partner" value={cents(b.partnerCents)} />
                <Stat
                  label="Pending / Approved / Paid"
                  value={`${cents(b.pendingCents)} · ${cents(b.approvedCents)} · ${cents(b.paidCents)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text)" }}>{value}</div>
    </div>
  );
}
