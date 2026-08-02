"use client";

import { useEffect, useState } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

function TicketQR({ code }: { code: string }) {
  const mounted = useMounted();
  const origin = mounted ? window.location.origin : "";
  const qrValue = origin ? `${origin}/checkin/${code}` : code;

  return (
    <div style={{
      width: 84, height: 84,
      background: "white", borderRadius: 10, padding: 6,
      flexShrink: 0, border: "1px solid var(--color-border)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {mounted ? (
        <QRCodeSVG value={qrValue} size={72} bgColor="#ffffff" fgColor="#1a1614" level="M" includeMargin={false} />
      ) : (
        <div style={{ width: 72, height: 72, background: "var(--layer-4)", borderRadius: 4 }} />
      )}
    </div>
  );
}

interface TicketSession {
  startsAt: string | Date;
  series: { title: string; slug: string; venue: string; city: string | null } | null;
}

interface Ticket {
  id: string;
  code: string;
  ticketStatus: string;
  attendeeName: string | null;
  createdAt: string | Date;
  session: TicketSession | null;
  ticketType: { name: string; tierCode: string } | null;
}

export function MyTicketsContent({ tickets, userName }: { tickets: Ticket[]; userName: string | null }) {
  const t = useTranslation();
  const locale = useLocale();
  const mounted = useMounted();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  function fmtDate(d: Date | string) {
    return new Date(d).toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  function fmtTime(d: Date | string) {
    return new Date(d).toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" });
  }

  const upcoming = tickets.filter((tk) => tk.session?.startsAt && new Date(tk.session.startsAt) >= new Date());
  const past     = tickets.filter((tk) => tk.session?.startsAt && new Date(tk.session.startsAt) < new Date());

  function TicketCard({ tk }: { tk: Ticket }) {
    const series  = tk.session?.series;
    const isPast  = tk.session?.startsAt && new Date(tk.session.startsAt) < new Date();
    const checked = tk.ticketStatus === "CHECKED_IN";
    const statusLabel = checked
      ? t("common", "checkedInStatus")
      : isPast ? t("common", "attendedStatus")
      : t("common", "confirmedStatus");

    const headerBg = checked
      ? "linear-gradient(135deg, #0d7a4e 0%, #065f46 100%)"
      : isPast
      ? "linear-gradient(135deg, #4b5563 0%, #374151 100%)"
      : "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)";

    return (
      <div className="ticket-card">
        {/* Card header */}
        <div style={{ background: headerBg, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 50%, rgba(196,30,58,0.12) 0%, transparent 60%)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>
              {series?.venue ?? "OKÜ"} · {tk.ticketType?.tierCode ?? "GA"}
            </div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, color: "white", fontWeight: 400, lineHeight: 1.2 }}>
              {series?.title ?? "Experience"}
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "4px 10px", borderRadius: 100,
            background: checked ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)",
            color: "white", position: "relative", zIndex: 1, flexShrink: 0,
          }}>
            {statusLabel}
          </span>
        </div>

        {/* Card body */}
        <div className="ticket-card-body" style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <TicketQR code={tk.code} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 5, fontSize: 14 }}>
              {tk.ticketType?.name ?? t("common", "generalAdmission")}
            </div>
            {tk.session?.startsAt && (
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 3 }} suppressHydrationWarning>
                {mounted ? `${fmtDate(tk.session.startsAt)} · ${fmtTime(tk.session.startsAt)}` : "—"}
              </div>
            )}
            {series?.city && <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{series.city}</div>}
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "monospace", marginTop: 10, letterSpacing: "0.1em" }}>
              {tk.code}
            </div>
          </div>
        </div>

        {/* Perforated divider */}
        <div style={{ borderTop: "2px dashed var(--color-border-light)", margin: "0 20px" }} />

        {/* Card footer */}
        <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {t("common", "forLabel")} {tk.attendeeName ?? userName}
          </div>
          {series?.slug && !isPast && (
            <Link href={`/experiences/${series.slug}`} style={{ fontSize: 12, color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>
              {t("common", "viewEventLink")} ›
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-canvas">
      {/* Header band */}
      <div style={{ background: "var(--layer-2)", borderBottom: "1px solid var(--color-border)", padding: "36px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div className="dash-eyebrow" style={{ color: "var(--color-primary)" }}>{t("common", "myAccount")}</div>
          <h1 className="page-header" style={{ marginBottom: 0 }}>{t("common", "myTickets")}</h1>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginTop: 24, borderBottom: "none" }}>
            <span className="tab active">{t("common", "ticketsTab")}</span>
            <Link href="/my/orders" className="tab">{t("common", "ordersTab")}</Link>
          </div>
        </div>
      </div>

      <div className="dashboard-body">
        {tickets.length === 0 ? (
          <div className="empty-panel" style={{ padding: "72px 32px" }}>
            <div className="empty-panel-icon" style={{ fontSize: 28 }}>✦</div>
            <div className="empty-panel-title">{t("common", "noTicketsYet")}</div>
            <div className="empty-panel-desc">{t("common", "findExperienceAndBook")}</div>
            <Link href="/experiences" className="btn btn-primary">{t("common", "browseExperiences")}</Link>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section style={{ marginBottom: 40 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div className="dash-section-title" style={{ marginBottom: 0 }}>{t("common", "upcoming")}</div>
                  <span className="badge badge-neutral">{upcoming.length}</span>
                </div>
                <div className="ticket-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18 }}>
                  {upcoming.map((tk) => <TicketCard key={tk.id} tk={tk} />)}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div className="dash-section-title" style={{ marginBottom: 0, color: "var(--color-text-secondary)" }}>{t("common", "past")}</div>
                  <span className="badge badge-neutral">{past.length}</span>
                </div>
                <div className="ticket-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18, opacity: 0.8 }}>
                  {past.map((tk) => <TicketCard key={tk.id} tk={tk} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
