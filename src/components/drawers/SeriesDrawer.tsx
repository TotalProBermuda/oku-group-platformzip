"use client";

import { useEffect, useState, useCallback } from "react";
import RightDetailDrawer from "./RightDetailDrawer";
import StatusBadge from "@/components/entities/StatusBadge";
import EntityLink from "@/components/entities/EntityLink";
import ActionMenu, { ActionItem } from "@/components/entities/ActionMenu";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import { Globe, EyeOff, Users, DollarSign, Calendar, Plus } from "lucide-react";

type Tab = "overview" | "sessions" | "orders";

function responseError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const { error, fields } = payload as { error?: unknown; fields?: Record<string, unknown> };
  if (fields) {
    for (const errors of Object.values(fields)) {
      if (!Array.isArray(errors)) continue;
      const message = errors.find((entry): entry is string => typeof entry === "string" && entry.length > 0);
      if (message) return message;
    }
  }
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

interface SeriesDrawerProps {
  seriesId: string | null;
  onClose: () => void;
  onUserOpen?: (userId: string) => void;
  onOrderOpen?: (orderId: string) => void;
  onUpdated?: () => void;
}

export default function SeriesDrawer({
  seriesId,
  onClose,
  onUserOpen,
  onOrderOpen,
  onUpdated,
}: SeriesDrawerProps) {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale =
    locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const [series, setSeries] = useState<any>(null);
  const [orders, setOrders] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState({ title: "", startsAt: "", endsAt: "", capacity: "" });
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const fetchSeries = useCallback(async () => {
    if (!seriesId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/admin/series?id=${seriesId}`);
      const all = await r.json();
      if (all.ok) {
        const found = all.data.find((s: any) => s.id === seriesId);
        setSeries(found || null);
      }
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  const fetchOrders = useCallback(async () => {
    if (!seriesId) return;
    setOrdersLoading(true);
    try {
      const r = await fetch(`/api/v1/admin/series/${seriesId}/orders`);
      const d = await r.json();
      if (d.ok) setOrders(d.data);
    } finally {
      setOrdersLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    if (seriesId) {
      setTab("overview");
      setSeries(null);
      setOrders(null);
      setMsg(null);
      setShowSessionForm(false);
      setSessionError(null);
      fetchSeries();
    }
  }, [seriesId, fetchSeries]);

  useEffect(() => {
    if (tab === "orders" && seriesId && !orders) {
      fetchOrders();
    }
  }, [tab, seriesId, orders, fetchOrders]);

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const createSession = async () => {
    if (!seriesId) return;
    setSessionSaving(true);
    setSessionError(null);
    try {
      const response = await fetch(`/api/v1/admin/series/${seriesId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sessionForm.title,
          startsAt: new Date(sessionForm.startsAt).toISOString(),
          endsAt: new Date(sessionForm.endsAt).toISOString(),
          capacity: Number(sessionForm.capacity),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
        setSessionError(responseError(payload, t("admin", "createEventFailed")));
        return;
      }
      setSessionForm({ title: "", startsAt: "", endsAt: "", capacity: "" });
      setShowSessionForm(false);
      await fetchSeries();
      onUpdated?.();
      flash(t("admin", "eventCreated"));
    } catch {
      setSessionError(t("admin", "createEventFailed"));
    } finally {
      setSessionSaving(false);
    }
  };

  const doAction = async (endpoint: string) => {
    const r = await fetch(`/api/v1/admin/series/${seriesId}/${endpoint}`, { method: "POST" });
    const d = await r.json();
    if (d.ok) {
      flash(t("admin", "actionSuccess"));
      fetchSeries();
      onUpdated?.();
    } else {
      flash(d.error || t("admin", "actionFailed"), false);
    }
  };

  const buildActions = (): ActionItem[] => {
    if (!series) return [];
    const items: ActionItem[] = [];

    if (series.status === "DRAFT") {
      items.push({
        key: "publish",
        label: t("admin", "publishSeries"),
        icon: <Globe size={13} />,
        onClick: () => doAction("publish"),
      });
    }

    if (series.status === "PUBLISHED") {
      items.push({
        key: "unpublish",
        label: t("admin", "unpublishSeries"),
        icon: <EyeOff size={13} />,
        danger: true,
        onClick: async () => {
          if (!confirm(t("admin", "unpublishConfirm"))) return;
          doAction("unpublish");
        },
      });
    }

    return items;
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const fmtMoney = (cents: number) =>
    new Intl.NumberFormat(dateLocale, { style: "currency", currency: "USD" }).format(
      cents / 100
    );

  const TABS = [
    { key: "overview", label: t("admin", "overview") },
    { key: "sessions", label: t("admin", "sessions"), badge: series?.sessions?.length },
    { key: "orders",   label: t("admin", "orders"), badge: orders?.count },
  ];

  return (
    <RightDetailDrawer
      open={!!seriesId}
      onClose={onClose}
      title={series?.title ?? t("admin", "series")}
      subtitle={series?.slug ? `/${series.slug}` : undefined}
      badge={series ? <StatusBadge status={series.status} dot /> : undefined}
      tabs={TABS as any}
      activeTab={tab}
      onTabChange={(k) => setTab(k as Tab)}
      width={560}
      loading={loading}
      footer={
        series ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", flex: 1 }}>
              {series.hostType}
              {series.venue ? ` · ${series.venue}` : ""}
            </span>
            <ActionMenu items={buildActions()} align="right" />
          </div>
        ) : undefined
      }
    >
      {msg && (
        <div
          style={{
            marginBottom: 14,
            padding: "9px 14px",
            borderRadius: 8,
            background: msg.ok ? "var(--color-success-bg)" : "var(--color-danger-bg)",
            color: msg.ok ? "var(--color-success)" : "var(--color-danger)",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {msg.text}
        </div>
      )}

      {series && tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Section title={t("admin", "details")}>
            <DetailRow label={t("admin", "status")}>
              <StatusBadge status={series.status} dot />
            </DetailRow>
            <DetailRow label={t("admin", "hostType")}>{series.hostType}</DetailRow>
            {series.venue && (
              <DetailRow label={t("admin", "venue")}>{series.venue}</DetailRow>
            )}
            {series.category && (
              <DetailRow label={t("admin", "category")}>{series.category}</DetailRow>
            )}
            {series.city && (
              <DetailRow label={t("admin", "location")}>
                {[series.city, series.country].filter(Boolean).join(", ")}
              </DetailRow>
            )}
            <DetailRow label={t("admin", "created")}>{fmtDate(series.createdAt)}</DetailRow>
          </Section>

          {series.description && (
            <Section title={t("admin", "description")}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.6 }}>
                {series.description}
              </p>
            </Section>
          )}

          {(series.influencer || series.partner) && (
            <Section title={t("admin", "host")}>
              {series.influencer?.user && (
                <EntityLink
                  entityType="user"
                  entityId={series.influencer.user.id}
                  label={series.influencer.user.name || series.influencer.user.email}
                  sublabel="Influencer"
                  variant="card"
                  onOpen={(_, id) => onUserOpen?.(id)}
                />
              )}
              {series.partner?.user && (
                <EntityLink
                  entityType="user"
                  entityId={series.partner.user.id}
                  label={series.partner.user.name || series.partner.user.email}
                  sublabel="Partner"
                  variant="card"
                  onOpen={(_, id) => onUserOpen?.(id)}
                />
              )}
            </Section>
          )}

          <Section title={t("admin", "stats")}>
            <StatPill icon={<Calendar size={13} />} label={t("admin", "sessions")} value={series._count?.sessions ?? series.sessions?.length ?? "—"} />
            <StatPill icon={<Users size={13} />} label={t("admin", "attendees")} value={series._count?.orders ?? "—"} />
          </Section>
        </div>
      )}

      {tab === "sessions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setShowSessionForm((current) => !current);
                setSessionError(null);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={13} />
              {showSessionForm ? t("admin", "cancel") : t("admin", "newEvent")}
            </button>
          </div>
          {showSessionForm && (
            <div className="card" style={{ padding: 16 }}>
              <div className="form-group" style={{ margin: "0 0 12px" }}>
                <label className="form-label" htmlFor="new-event-title">{t("admin", "eventTitle")}</label>
                <input
                  id="new-event-title"
                  className="form-input"
                  value={sessionForm.title}
                  onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })}
                  maxLength={160}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="new-event-start">{t("admin", "eventStarts")}</label>
                  <input id="new-event-start" type="datetime-local" className="form-input" value={sessionForm.startsAt} onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="new-event-end">{t("admin", "eventEnds")}</label>
                  <input id="new-event-end" type="datetime-local" className="form-input" value={sessionForm.endsAt} onChange={(event) => setSessionForm({ ...sessionForm, endsAt: event.target.value })} />
                </div>
              </div>
              <div className="form-group" style={{ margin: "12px 0" }}>
                <label className="form-label" htmlFor="new-event-capacity">{t("admin", "capacity")}</label>
                <input id="new-event-capacity" type="number" min={1} max={100000} step={1} className="form-input" value={sessionForm.capacity} onChange={(event) => setSessionForm({ ...sessionForm, capacity: event.target.value })} />
              </div>
              {sessionError && <p role="alert" style={{ color: "#b42318", fontSize: 13, margin: "0 0 12px" }}>{sessionError}</p>}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={sessionSaving || !sessionForm.startsAt || !sessionForm.endsAt || !sessionForm.capacity}
                onClick={createSession}
              >
                {sessionSaving ? t("admin", "creating") : t("admin", "createEvent")}
              </button>
            </div>
          )}
          {!series?.sessions?.length && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)", fontSize: 13 }}>
              {t("admin", "noSessionsFound")}
            </div>
          )}
          {series?.sessions?.map((sess: any) => (
            <div
              key={sess.id}
              style={{
                padding: "14px 16px",
                background: "var(--color-bg)",
                borderRadius: 10,
                border: "1px solid var(--color-border-light)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {sess.title && (
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sess.title}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: sess.title ? 400 : 600 }}>
                    {fmtDate(sess.startsAt)}
                  </div>
                  {sess.endsAt && (
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
                      {t("admin", "until")} {fmtDate(sess.endsAt)}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    {sess.capacityOverride != null && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-muted)" }}>
                        <Users size={11} />
                        <span>Cap: {sess.capacityOverride}</span>
                      </div>
                    )}
                    {sess._count?.tickets != null && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-muted)" }}>
                        <Users size={11} />
                        <span>{sess._count.tickets} tickets</span>
                      </div>
                    )}
                  </div>
                </div>
                <StatusBadge status={sess.status} size="xs" />
              </div>
              {series?.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border-light)" }}>
                  <a
                    href={`/admin/experiences/${series.id}/attendees?session=${sess.id}`}
                    style={{ fontSize: 11, color: "var(--color-primary)", fontWeight: 600, textDecoration: "none" }}
                  >
                    View Attendees →
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "orders" && (
        <div>
          {ordersLoading ? (
            <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t("admin", "loading")}</div>
          ) : orders ? (
            <>
              {orders.totalRevenueCents > 0 && (
                <div
                  style={{
                    padding: "12px 14px",
                    background: "var(--color-success-bg)",
                    borderRadius: 8,
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <DollarSign size={14} color="var(--color-success)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-success)" }}>
                    {fmtMoney(orders.totalRevenueCents)} {t("admin", "totalRevenue")}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {orders.orders.map((o: any) => (
                  <button
                    key={o.id}
                    onClick={() => onOrderOpen?.(o.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border-light)",
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-primary)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-light)"; }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {o.user?.name || o.user?.email || "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace" }}>
                        ···{o.id.slice(-8)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <StatusBadge status={o.status} size="xs" />
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 3 }}>
                        {fmtMoney(o.totalCents)}
                      </div>
                    </div>
                  </button>
                ))}
                {orders.orders.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)", fontSize: 13 }}>
                    {t("admin", "noOrdersFound")}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </RightDetailDrawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--color-text)", textAlign: "right" }}>{children}</span>
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
        {icon}
        {label}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>{value}</span>
    </div>
  );
}
