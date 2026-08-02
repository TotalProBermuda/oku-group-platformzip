"use client";

import { useEffect, useState } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import { getTicketTypeName, getSessionTitle } from "@/data/seriesTranslations";
import type { Locale } from "@/types/i18n";

interface TicketType {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  maxPerOrder: number;
}

interface Session {
  id: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  soldCount: number;
}

interface Series {
  id: string;
  slug: string;
  title: string;
  venue: string | null;
  sessions: Session[];
  ticketTypes: TicketType[];
}

interface OrderResult {
  id: string;
  totalCents: number;
  tickets: { id: string; code: string }[];
}

export default function CheckoutPage({ params }: { params: any }) {
  const t = useTranslation();
  const locale = useLocale();

  const dateLocale =
    locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const dateFmt = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const [series, setSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then((p: any) => {
      const s = typeof p === "string" ? p : p.slug;
      setSlug(s);
    });
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    fetch("/api/v1/series")
      .then((r) => r.json())
      .then((json) => {
        const found = (json.data || []).find((s: any) => s.slug === slug);
        if (!found) {
          setError(t("common", "seriesNotFound"));
        } else {
          setSeries(found);
          if (found.sessions?.length > 0) {
            setSelectedSession(found.sessions[0].id);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setError(t("common", "failedToLoad"));
        setLoading(false);
      });
  }, [slug]);

  const setQty = (ticketTypeId: string, qty: number) => {
    setQuantities((prev) => ({ ...prev, [ticketTypeId]: Math.max(0, qty) }));
  };

  const subtotalCents = series
    ? series.ticketTypes.reduce(
        (sum, tt) => sum + (quantities[tt.id] || 0) * tt.priceCents,
        0
      )
    : 0;

  const totalItems = Object.values(quantities).reduce((s, q) => s + q, 0);

  const handlePurchase = async () => {
    if (!series || !selectedSession || totalItems === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = series.ticketTypes
        .filter((tt) => (quantities[tt.id] || 0) > 0)
        .map((tt) => ({ ticketTypeId: tt.id, qty: quantities[tt.id] }));

      const res = await fetch("/api/v1/checkout/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId: series.id, sessionId: selectedSession, items }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || t("common", "purchaseFailed"));
      } else {
        setOrder(json.data);
      }
    } catch {
      setError(t("common", "networkErrorRetry"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 16px" }}>
        <div className="empty-state">{t("common", "loadingCheckout")}</div>
      </div>
    );
  }

  if (error && !series) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 16px" }}>
        <div className="card" style={{ textAlign: "center", color: "var(--color-danger)" }}>{error}</div>
      </div>
    );
  }

  if (order) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 16px" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-success)", marginBottom: 12 }}>
            ✓ {t("common", "purchaseCompleteTitle")}
          </div>
          <p className="text-secondary">{t("common", "orderIdLabel")} {order.id}</p>
          <p style={{ fontWeight: 600 }}>{t("common", "totalLabel")} ${(order.totalCents / 100).toFixed(2)}</p>
          <h3 className="section-title">{t("common", "yourTicketsLabel")}</h3>
          <div className="flex flex-wrap gap-2" style={{ justifyContent: "center" }}>
            {order.tickets.map((tk) => (
              <span key={tk.id} className="badge badge-success" style={{ fontSize: 14, padding: "8px 16px" }}>
                {tk.code}
              </span>
            ))}
          </div>
          <div className="mt-4">
            <a href="/my/orders" className="btn btn-primary">{t("common", "viewMyOrders")}</a>
          </div>
        </div>
      </div>
    );
  }

  if (!series) return null;

  const selectedSessionObj = series.sessions.find((s) => s.id === selectedSession);
  const ticketWord = totalItems === 1 ? t("common", "ticketSingular") : t("common", "ticketPlural");

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 16px" }}>
      <h1 className="page-header">{t("common", "checkoutTitle")} — {series.title}</h1>

      {error && (
        <div className="card mb-4" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
          {error}
        </div>
      )}

      <div className="card mb-4">
        <div className="form-group">
          <label className="form-label">{t("common", "selectSessionLabel")}</label>
          <select
            className="form-input"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            {series.sessions.map((sess) => {
              const spotsLeft = sess.capacity - sess.soldCount;
              const label = spotsLeft <= 0
                ? t("common", "soldOut")
                : t("common", "spotsLeft").replace("{n}", String(spotsLeft));
              return (
                <option key={sess.id} value={sess.id} disabled={spotsLeft <= 0}>
                  {getSessionTitle(sess.title || t("common", "sessionLabel"), locale as Locale)} — {dateFmt.format(new Date(sess.startsAt))} ({label})
                </option>
              );
            })}
          </select>
        </div>

        {selectedSessionObj && (
          <div className="text-sm text-secondary mb-4">
            {dateFmt.format(new Date(selectedSessionObj.startsAt))} — {dateFmt.format(new Date(selectedSessionObj.endsAt))}
            {" · "}{t("common", "capacityLabel")}: {selectedSessionObj.capacity}
            {" · "}{t("common", "soldLabel")}: {selectedSessionObj.soldCount}
          </div>
        )}
      </div>

      <div className="card mb-4">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t("common", "selectTicketsLabel")}</h2>
        {series.ticketTypes.map((tt) => (
          <div key={tt.id} className="flex items-center justify-between" style={{ padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{getTicketTypeName(tt.name, locale as Locale)}</div>
              {tt.description && <div className="text-sm text-secondary">{tt.description}</div>}
              <div style={{ fontWeight: 600, color: "var(--color-primary)" }}>${(tt.priceCents / 100).toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setQty(tt.id, (quantities[tt.id] || 0) - 1)}
                disabled={(quantities[tt.id] || 0) <= 0}
              >
                −
              </button>
              <span style={{ minWidth: 24, textAlign: "center", fontWeight: 600 }}>{quantities[tt.id] || 0}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setQty(tt.id, (quantities[tt.id] || 0) + 1)}
                disabled={(quantities[tt.id] || 0) >= tt.maxPerOrder}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <span className="text-secondary">
            {t("common", "subtotalLabel")} ({totalItems} {ticketWord})
          </span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>${(subtotalCents / 100).toFixed(2)}</span>
        </div>
      </div>

      <button
        className="btn btn-primary"
        style={{ width: "100%", padding: "14px 20px", fontSize: 16 }}
        disabled={submitting || totalItems === 0 || !selectedSession}
        onClick={handlePurchase}
      >
        {submitting ? t("common", "processingLabel") : t("common", "completeDemoPurchase")}
      </button>
    </div>
  );
}
