"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  QrCode, CheckCircle2, UtensilsCrossed, ChefHat, Wine,
  PartyPopper, CalendarCheck, Users, TrendingUp, Megaphone,
  LayoutDashboard, AlertTriangle, ChevronRight, BookOpen,
  MapPin, Hash, Clock,
} from "lucide-react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import { EmptyStateCard } from "@/components/ui/dashboard";

interface Sop {
  id: string;
  title: string;
  department: string;
  venue: string | null;
  version: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

const deptIcons: Record<string, React.ElementType> = {
  FOH:          UtensilsCrossed,
  BOH:          ChefHat,
  BAR:          Wine,
  EVENTS:       PartyPopper,
  RESERVATIONS: CalendarCheck,
  HR:           Users,
  FINANCE:      TrendingUp,
  MARKETING_PR: Megaphone,
  MANAGEMENT:   LayoutDashboard,
};

export default function StaffPortal() {
  const t = useTranslation();
  const locale = useLocale();
  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  const dateFmt = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US", {
    month: "short", day: "numeric",
  });

  useEffect(() => {
    fetch("/api/v1/staff/sops")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setSops(res.data);
        else setError(res.error || t("common", "failedToLoadSops"));
      })
      .catch(() => setError(t("common", "failedToLoadSops")))
      .finally(() => setLoading(false));
  }, []);

  async function handleAcknowledge(sopId: string) {
    setAcking(sopId);
    try {
      const res = await fetch("/api/v1/staff/sops/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sopId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSops((prev) =>
          prev.map((s) => s.id === sopId ? { ...s, acknowledged: true, acknowledgedAt: new Date().toISOString() } : s)
        );
      }
    } finally {
      setAcking(null);
    }
  }

  const totalAcked = sops.filter((s) => s.acknowledged).length;
  const pct = sops.length > 0 ? Math.round((totalAcked / sops.length) * 100) : 0;

  const grouped: Record<string, Sop[]> = {};
  sops.forEach((sop) => {
    if (!grouped[sop.department]) grouped[sop.department] = [];
    grouped[sop.department].push(sop);
  });

  return (
    <div className="dashboard-canvas">
      {/* Header band */}
      <div style={{ background: "var(--layer-2)", borderBottom: "1px solid var(--color-border)", padding: "36px 0 28px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div className="dash-eyebrow">{t("common", "portalStaffTitle")}</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <h1 className="page-header" style={{ marginBottom: 0 }}>{t("common", "sopTitle")}</h1>
            {sops.length > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: pct === 100 ? "var(--color-success)" : "var(--color-text)", lineHeight: 1 }}>
                  {pct}%
                </div>
                <div className="kpi-label">{totalAcked}/{sops.length} {t("common", "acknowledged") || "acknowledged"}</div>
              </div>
            )}
          </div>
          {sops.length > 0 && (
            <div style={{ height: 3, background: "var(--color-border-light)", borderRadius: 4, marginTop: 16, maxWidth: 320, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "var(--color-success)" : "var(--color-primary)", borderRadius: 4, transition: "width 0.4s ease-out" }} />
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-body">
        {/* QR Check-in CTA — prominent on mobile, elegant on desktop */}
        <Link href="/staff/check-in" style={{ textDecoration: "none", display: "block", marginBottom: 24 }}>
          <div className="qr-checkin-cta">
            <div className="qr-checkin-icon-wrap">
              <QrCode size={28} strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>
                {t("checkin", "title")}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                {t("checkin", "point_camera")}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
              <span>{t("common", "open") || "Open"}</span>
              <ChevronRight size={14} strokeWidth={2} />
            </div>
          </div>
        </Link>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {[1, 2].map((i) => (
              <div key={i} className="panel">
                <div className="skeleton" style={{ height: 20, width: 160, marginBottom: 20 }} />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="skeleton" style={{ height: 140, borderRadius: "var(--radius-panel)" }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="alert-strip alert-strip-error">
            <AlertTriangle size={16} className="alert-strip-icon" />
            {error}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyStateCard icon={<BookOpen size={32} strokeWidth={1} />} title={t("common", "noSopsAvailable")} description={t("common", "sopsSharedMsg")} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {Object.entries(grouped).map(([dept, items]) => {
              const DeptIcon = deptIcons[dept] || BookOpen;
              const deptAcked = items.filter((i) => i.acknowledged).length;
              return (
                <div key={dept} className="panel">
                  <div className="panel-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: "var(--layer-4)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--color-primary)",
                      }}>
                        <DeptIcon size={16} strokeWidth={1.5} />
                      </div>
                      <div>
                        <div className="panel-title">{dept.replace(/_/g, " ")}</div>
                        <div className="panel-subtitle">{deptAcked}/{items.length} {t("common", "acknowledged") || "acknowledged"}</div>
                      </div>
                    </div>
                    <span className={`badge ${deptAcked === items.length ? "badge-success" : "badge-neutral"}`}>
                      {deptAcked}/{items.length}
                    </span>
                  </div>

                  <div className="scroll-depth-container">
                    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                      {items.map((sop) => (
                        <div
                          key={sop.id}
                          className="module-card"
                          style={{
                            borderLeft: `3px solid ${sop.acknowledged ? "var(--color-success)" : "var(--color-border)"}`,
                            cursor: "default",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                            <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 400, lineHeight: 1.3, color: "var(--color-text)" }}>
                              {sop.title}
                            </div>
                            {sop.acknowledged && (
                              <CheckCircle2 size={16} strokeWidth={1.5} style={{ color: "var(--color-success)", flexShrink: 0, marginTop: 2 }} />
                            )}
                          </div>

                          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                            {sop.venue && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <MapPin size={11} strokeWidth={1.5} style={{ color: "var(--color-text-muted)" }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>{sop.venue}</span>
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <Hash size={11} strokeWidth={1.5} style={{ color: "var(--color-text-muted)" }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>v{sop.version}</span>
                            </div>
                            {sop.acknowledgedAt && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <Clock size={11} strokeWidth={1.5} style={{ color: "var(--color-success)" }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-success)" }}>{dateFmt.format(new Date(sop.acknowledgedAt))}</span>
                              </div>
                            )}
                          </div>

                          {!sop.acknowledged && (
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={acking === sop.id}
                              onClick={() => handleAcknowledge(sop.id)}
                              style={{ width: "100%", opacity: acking === sop.id ? 0.6 : 1 }}
                            >
                              {acking === sop.id ? t("common", "confirming") : t("common", "acknowledgeSign")}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
