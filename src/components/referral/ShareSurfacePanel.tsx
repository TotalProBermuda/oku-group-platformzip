"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * ShareSurfacePanel — mobile share wallet for ReferralActors.
 *
 * Renders the bucketed share surface returned by
 * `GET /api/v1/referrer/share-surface`:
 *   Today · This week · Restaurants · Events · My assigned offers · Past
 *
 * Each card has a one-tap Share/Copy/QR action so a taxi driver can pick
 * "what to share right now" without scrolling. Empty buckets collapse.
 */

type OfferType =
  | "RESTAURANT"
  | "EVENT"
  | "SERIES"
  | "MEMBERSHIP"
  | "PRIVATE_DINING"
  | "PACKAGE"
  | null;

interface ShareCard {
  assignmentId: string;
  offerType: OfferType;
  offerLabel: string | null;
  offerStartAt: string | null;
  offerEndAt: string | null;
  scopeType: string;
  scopeId: string | null;
  isCommissionEligible: boolean;
  compensationMode: string;
  primaryLink: { id: string; code: string; url: string | null; clickCount: number } | null;
  totalClicks: number;
  conversionCount?: number;
  lastConvertedAt?: string | null;
  venueLabel?: string | null;
  bestUseHint?: string | null;
  commissionSummary?: string | null;
  cardStatus?: "ACTIVE" | "UPCOMING" | "PAUSED" | "PAST";
}

interface SurfaceData {
  actor: {
    id: string;
    displayName: string;
    actorType: string;
    organizationName: string | null;
    isVerified?: boolean;
  };
  buckets: {
    today: ShareCard[];
    thisWeek: ShareCard[];
    restaurants: ShareCard[];
    events: ShareCard[];
    assigned: ShareCard[];
    past: ShareCard[];
  };
  counts: Record<string, number>;
}

type BucketKey = "today" | "thisWeek" | "restaurants" | "events" | "assigned" | "past";

const BUCKET_LABELS: Record<BucketKey, string> = {
  today: "Today",
  thisWeek: "This week",
  restaurants: "Restaurants",
  events: "Events",
  assigned: "My assigned offers",
  past: "Past activity",
};

const OFFER_BADGE: Record<NonNullable<OfferType>, { label: string; color: string }> = {
  RESTAURANT: { label: "Restaurant", color: "#c8a96e" },
  EVENT: { label: "Event", color: "#a78bfa" },
  SERIES: { label: "Series", color: "#60a5fa" },
  MEMBERSHIP: { label: "Membership", color: "#34d399" },
  PRIVATE_DINING: { label: "Private dining", color: "#f59e0b" },
  PACKAGE: { label: "Package", color: "#f87171" },
};

function formatWindow(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end!)}`;
  return null;
}

function buildShareUrl(card: ShareCard): string | null {
  if (!card.primaryLink) return null;
  if (card.primaryLink.url) return card.primaryLink.url;
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/r/${card.primaryLink.code}`;
}

export function ShareSurfacePanel({ endpoint = "/api/v1/referrer/share-surface" }: { endpoint?: string } = {}) {
  const [data, setData] = useState<SurfaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<BucketKey>("today");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [qrAssignmentId, setQrAssignmentId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function") {
      setCanShare(true);
    }
  }, []);

  useEffect(() => {
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e?.error || "Failed to load"))))
      .then((d: SurfaceData) => setData(d))
      .catch((e: string) => setError(typeof e === "string" ? e : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const buckets: BucketKey[] = useMemo(() => {
    if (!data) return ["today", "thisWeek", "restaurants", "events", "assigned", "past"];
    // Auto-pick the first non-empty bucket as the default tab
    const order: BucketKey[] = ["today", "thisWeek", "restaurants", "events", "assigned", "past"];
    return order;
  }, [data]);

  // Pick a useful default the first time data lands
  useEffect(() => {
    if (!data) return;
    const order: BucketKey[] = ["today", "thisWeek", "restaurants", "events", "assigned", "past"];
    const firstNonEmpty = order.find((b) => data.buckets[b].length > 0);
    if (firstNonEmpty) setActiveBucket(firstNonEmpty);
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
        Loading your offers…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: 24, textAlign: "center",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        color: "#9ca3af", fontSize: 13,
      }}>
        {error}
      </div>
    );
  }

  if (!data) return null;

  const cards = data.buckets[activeBucket];

  async function copyLink(card: ShareCard) {
    const url = buildShareUrl(card);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(card.assignmentId);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      /* swallow */
    }
  }

  function whatsappLink(card: ShareCard) {
    const url = buildShareUrl(card);
    if (!url) return;
    const text = card.offerLabel
      ? `${data!.actor.displayName} invites you: ${card.offerLabel}\n${url}`
      : `${data!.actor.displayName} invites you to OKÜ.\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  async function shareLink(card: ShareCard) {
    const url = buildShareUrl(card);
    if (!url) return;
    const text = card.offerLabel
      ? `${data!.actor.displayName} invites you: ${card.offerLabel}`
      : `${data!.actor.displayName} invites you to OKÜ.`;
    try {
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
        title: card.offerLabel || "Book with OKÜ",
        text,
        url,
      });
    } catch {
      copyLink(card);
    }
  }

  return (
    <div>
      {/* Bucket selector — horizontally scrollable on small screens */}
      <div style={{
        display: "flex", gap: 6, overflowX: "auto",
        paddingBottom: 4, marginBottom: 14,
        WebkitOverflowScrolling: "touch",
      }}>
        {buckets.map((b) => {
          const count = data.buckets[b].length;
          const isActive = activeBucket === b;
          return (
            <button
              key={b}
              onClick={() => setActiveBucket(b)}
              style={{
                flexShrink: 0,
                padding: "8px 14px",
                borderRadius: 999,
                border: isActive ? "1px solid rgba(200,169,110,0.5)" : "1px solid rgba(255,255,255,0.08)",
                background: isActive ? "rgba(200,169,110,0.16)" : "rgba(255,255,255,0.04)",
                color: isActive ? "#c8a96e" : "#9ca3af",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                cursor: "pointer",
                whiteSpace: "nowrap",
                minHeight: 36,
              }}
            >
              {BUCKET_LABELS[b]}
              {count > 0 && (
                <span style={{
                  marginLeft: 6, padding: "1px 6px", borderRadius: 999,
                  background: isActive ? "#c8a96e" : "rgba(255,255,255,0.08)",
                  color: isActive ? "#000" : "#6b7280",
                  fontSize: 10, fontWeight: 700,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {cards.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 16px",
          background: "rgba(255,255,255,0.03)",
          border: "1px dashed rgba(255,255,255,0.08)",
          borderRadius: 14, color: "#6b7280",
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>—</div>
          <p style={{ fontSize: 13, margin: 0 }}>
            {activeBucket === "past"
              ? "No recently expired offers."
              : "No offers in this bucket yet. New offers from OKÜ will appear here."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cards.map((card) => {
            const badge = card.offerType ? OFFER_BADGE[card.offerType] : null;
            const window = formatWindow(card.offerStartAt, card.offerEndAt);
            const url = buildShareUrl(card);
            const isPast = activeBucket === "past";

            return (
              <div
                key={card.assignmentId}
                style={{
                  background: isPast ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: 14,
                  opacity: isPast ? 0.7 : 1,
                }}
              >
                {/* Header row: label + offer-type pill */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
                      {card.offerLabel || "Untitled offer"}
                    </div>
                    {window && (
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{window}</div>
                    )}
                  </div>
                  {badge && (
                    <span style={{
                      flexShrink: 0,
                      padding: "2px 8px", borderRadius: 999,
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background: badge.color + "22",
                      color: badge.color,
                      border: `1px solid ${badge.color}55`,
                    }}>{badge.label}</span>
                  )}
                </div>

                {/* Status pill — explicit ACTIVE/UPCOMING/PAUSED/PAST */}
                {card.cardStatus && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 999,
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background:
                        card.cardStatus === "ACTIVE" ? "rgba(52,211,153,0.18)" :
                        card.cardStatus === "UPCOMING" ? "rgba(200,169,110,0.18)" :
                        card.cardStatus === "PAUSED" ? "rgba(251,191,36,0.18)" :
                        "rgba(156,163,175,0.18)",
                      color:
                        card.cardStatus === "ACTIVE" ? "#34d399" :
                        card.cardStatus === "UPCOMING" ? "#c8a96e" :
                        card.cardStatus === "PAUSED" ? "#fbbf24" :
                        "#9ca3af",
                    }}>{card.cardStatus}</span>
                  </div>
                )}

                {/* Decisioning row — venue + best-use hint only (commission moved to Performance disclosure) */}
                {(card.venueLabel || card.bestUseHint) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
                    {card.venueLabel && (
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        <span style={{ color: "#c8a96e" }}>◆</span> {card.venueLabel}
                      </div>
                    )}
                    {card.bestUseHint && (
                      <div style={{ fontSize: 11, color: "#a3a3a3", fontStyle: "italic" }}>
                        {card.bestUseHint}
                      </div>
                    )}
                  </div>
                )}

                {/* Performance disclosure — private operator metrics, hidden by default */}
                <details style={{ marginBottom: 12 }}>
                  <summary style={{
                    fontSize: 10, color: "#4b5563", letterSpacing: "0.06em",
                    textTransform: "uppercase", cursor: "pointer",
                    userSelect: "none", listStyle: "none", display: "inline-flex",
                    alignItems: "center", gap: 4,
                  }}>
                    <span>▸</span> Performance
                  </summary>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "#6b7280", marginTop: 8 }}>
                    <span>{card.totalClicks} {card.totalClicks === 1 ? "click" : "clicks"}</span>
                    {(card.conversionCount ?? 0) > 0 && (
                      <span style={{ color: "#c8a96e" }}>
                        · {card.conversionCount} {card.conversionCount === 1 ? "booking" : "bookings"}
                      </span>
                    )}
                    {card.isCommissionEligible && card.commissionSummary && (
                      <span style={{ color: "#34d399" }}>· Earns {card.commissionSummary}</span>
                    )}
                    {card.isCommissionEligible && !card.commissionSummary && (
                      <span style={{ color: "#34d399" }}>· Earns commission</span>
                    )}
                    {isPast && card.lastConvertedAt && (
                      <span>· Last booking {new Date(card.lastConvertedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    )}
                  </div>
                </details>

                {/* Action row: Share / WhatsApp / QR / Copy (mobile-first 44px targets) */}
                {url ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {canShare && !isPast && (
                      <button
                        onClick={() => shareLink(card)}
                        style={{
                          flex: "1 1 90px", minHeight: 44,
                          background: "#c8a96e", color: "#000",
                          border: "none", borderRadius: 8,
                          fontSize: 13, fontWeight: 800, cursor: "pointer",
                          letterSpacing: "0.02em",
                        }}
                      >
                        Share
                      </button>
                    )}
                    {!isPast && (
                      <button
                        onClick={() => whatsappLink(card)}
                        style={{
                          flex: "1 1 90px", minHeight: 44,
                          background: "#25D366", color: "#000",
                          border: "none", borderRadius: 8,
                          fontSize: 13, fontWeight: 800, cursor: "pointer",
                          letterSpacing: "0.02em",
                        }}
                        title="Share via WhatsApp"
                      >
                        WhatsApp
                      </button>
                    )}
                    <button
                      onClick={() => setQrAssignmentId(qrAssignmentId === card.assignmentId ? null : card.assignmentId)}
                      style={{
                        flex: "1 1 70px", minHeight: 44,
                        background: qrAssignmentId === card.assignmentId ? "#fff" : "rgba(255,255,255,0.06)",
                        color: qrAssignmentId === card.assignmentId ? "#000" : "#e5e7eb",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 8,
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {qrAssignmentId === card.assignmentId ? "Hide QR" : "Show QR"}
                    </button>
                    <button
                      onClick={() => copyLink(card)}
                      style={{
                        flex: "1 1 70px", minHeight: 44,
                        background: copiedId === card.assignmentId ? "#10b981" : "rgba(255,255,255,0.06)",
                        color: copiedId === card.assignmentId ? "#fff" : "#e5e7eb",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 8,
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {copiedId === card.assignmentId ? "✓" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <div style={{
                    fontSize: 11, color: "#6b7280", padding: "8px 0", fontStyle: "italic",
                  }}>
                    No share link yet. Contact your OKÜ account manager.
                  </div>
                )}

                {/* Inline QR — uses Google Chart QR API as a zero-dependency
                    rendering path (image only; no JS exec). Tap-to-toggle so
                    a referrer can show their phone screen to a guest. */}
                {qrAssignmentId === card.assignmentId && url && (
                  <div style={{
                    marginTop: 12, padding: 12,
                    background: "#fff", borderRadius: 8,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`}
                      alt={`QR for ${card.offerLabel || "offer"}`}
                      width={200}
                      height={200}
                      style={{ display: "block" }}
                    />
                    <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>
                      {card.primaryLink?.code}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
