"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import type { CheckInEvent } from "@/lib/checkInEmitter";

interface UserData {
  user: { id: string; name: string | null; email: string; imageUrl: string | null };
  roles: string[];
}

interface TicketData {
  id: string;
  code: string;
  checkedInAt: string | null;
}

interface OrderData {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  series: { title: string; slug: string; venue: string | null };
  session: { title: string | null; startsAt: string };
  lineItems: { qty: number; totalCents: number; ticketType: { name: string; priceCents: number } }[];
  tickets: TicketData[];
  payment: { status: string } | null;
}

const statusBadgeClass: Record<string, string> = {
  PAID: "badge-success",
  PENDING: "badge-warning",
  FAILED: "badge-danger",
  REFUNDED: "badge-neutral",
  CANCELLED: "badge-neutral",
};

const roleKeys: Record<string, string> = {
  SUPERADMIN:            "Superadmin",
  FB_DIRECTOR:           "F&B Director",
  RESTAURANT_SUPERVISOR: "Restaurant Supervisor",
  ADMIN_COMMERCIAL:      "Admin Commercial",
  ADMIN_IR:              "Admin IR",
  ADMIN_HR:              "Admin HR",
  INFLUENCER:            "Influencer",
  PARTNER:               "Partner",
  INVESTOR:              "Investor",
  STAFF_OKU:             "Staff OKÜ",
  STAFF_CATCH:           "Staff CATCH",
  ATTENDEE:              "Attendee",
};

export function AccountContent() {
  const t = useTranslation();
  const locale = useLocale();
  const [user, setUser] = useState<UserData | null>(null);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const dateFmt = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/me").then((r) => r.json()),
      fetch("/api/v1/me/orders").then((r) => r.json()),
    ])
      .then(([meJson, ordersJson]) => {
        if (meJson.ok) setUser(meJson.data);
        else setError(t("common", "failedToLoadProfile"));
        if (ordersJson.ok) setOrders(ordersJson.data || []);
        setLoading(false);

        // Open SSE stream once we know the userId
        if (meJson.ok && meJson.data?.user?.id) {
          const userId = meJson.data.user.id;
          const es = new EventSource(`/api/v1/events/checkin/stream?userId=${encodeURIComponent(userId)}`);
          esRef.current = es;

          es.onmessage = (e) => {
            try {
              const event: CheckInEvent = JSON.parse(e.data);
              // Update matching ticket across all orders
              setOrders((prev) =>
                prev.map((order) => ({
                  ...order,
                  tickets: order.tickets.map((tk) =>
                    tk.code === event.ticketCode
                      ? { ...tk, checkedInAt: event.checkedInAt }
                      : tk
                  ),
                }))
              );
              setRecentScans((prev) => [event.ticketCode, ...prev].slice(0, 10));
            } catch {}
          };
        }
      })
      .catch(() => {
        setError(t("common", "failedToLoadAccount"));
        setLoading(false);
      });

    return () => {
      esRef.current?.close();
    };
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <div className="loading-dots"><span /><span /><span /></div>
    </div>
  );

  if (error && !user) return (
    <div className="page-container" style={{ textAlign: "center", paddingTop: 60 }}>
      <div className="alert alert-danger" style={{ maxWidth: 480, margin: "0 auto 24px" }}>{error}</div>
      <Link href="/login" className="btn btn-primary">{t("auth", "signIn")}</Link>
    </div>
  );

  const initials = user?.user.name
    ? user.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.user.email?.charAt(0).toUpperCase() || "?";

  return (
    <div>
      <div style={{ background: "#f8f5f3", borderBottom: "1px solid var(--color-border)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 20 }}>
          {user?.user.imageUrl ? (
            <img src={user.user.imageUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "var(--color-primary)", color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 22, flexShrink: 0,
            }}>
              {initials}
            </div>
          )}
          <div>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4 }}>
              {user?.user.name || t("common", "myAccount")}
            </h1>
            <p className="text-secondary" style={{ marginBottom: 8 }}>{user?.user.email}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {user?.roles.map((role) => (
                <span key={role} className="badge badge-neutral">{roleKeys[role] || role}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="page-container">
        <h2 className="section-title">{t("common", "orderHistory")}</h2>
        {orders.length === 0 ? (
          <div className="empty-state" style={{ padding: "48px 24px" }}>
            <div className="empty-state-icon">🎟️</div>
            <div className="empty-state-title">{t("common", "noOrdersYet")}</div>
            <p className="text-secondary" style={{ marginBottom: 20 }}>{t("common", "noOrdersDesc")}</p>
            <Link href={`/${locale}/experiences`} className="btn btn-primary btn-sm">{t("common", "exploreSeries")}</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {orders.map((order) => (
              <div key={order.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                  <div>
                    <Link href={`/${locale}/experiences/${order.series.slug}`} style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, color: "var(--color-text)" }}>
                      {order.series.title}
                    </Link>
                    {order.series.venue && (
                      <span className={`badge ${order.series.venue === "CATCH" ? "badge-info" : "badge-neutral"}`} style={{ marginLeft: 10 }}>
                        {order.series.venue}
                      </span>
                    )}
                    <div className="text-sm text-secondary" style={{ marginTop: 4 }}>
                      {dateFmt.format(new Date(order.createdAt))}
                      {order.session?.startsAt && (
                        <span style={{ marginLeft: 12 }}>{t("common", "eventDateLabel")} {dateFmt.format(new Date(order.session.startsAt))}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                    <span className={`badge ${statusBadgeClass[order.status] || "badge-neutral"}`}>
                      {order.status}
                    </span>
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, color: "var(--color-primary)" }}>
                      ${(order.totalCents / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                {order.lineItems?.length > 0 && (
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 12, paddingBottom: 12, borderTop: "1px solid var(--color-border-light)", borderBottom: "1px solid var(--color-border-light)", marginBottom: 12 }}>
                    {order.lineItems.map((li, i) => (
                      <div key={i}>
                        <span className="text-sm" style={{ fontWeight: 600 }}>{li.qty}× {li.ticketType.name}</span>
                        <span className="text-sm text-muted"> — ${(li.totalCents / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {order.tickets?.length > 0 && (
                  <div>
                    <div className="text-xs text-muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      {t("common", "yourTickets")}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {order.tickets.map((tk) => {
                        const isNewScan = recentScans.includes(tk.code);
                        return (
                          <div key={tk.id} style={{
                            padding: "6px 14px",
                            border: `1.5px solid ${tk.checkedInAt ? "#a7f3d0" : "var(--color-border)"}`,
                            borderRadius: "var(--radius)",
                            background: tk.checkedInAt ? "#f0faf5" : "white",
                            transition: "all 0.5s ease",
                            boxShadow: isNewScan && tk.checkedInAt ? "0 0 0 3px rgba(34,197,94,0.25)" : "none",
                          }}>
                            <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: tk.checkedInAt ? "var(--color-success)" : "var(--color-text)" }}>
                              {tk.code}
                            </span>
                            {tk.checkedInAt && (
                              <span className="text-xs text-success" style={{ marginLeft: 6 }}>✓</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
