"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import EntityTable, { EntityColumn } from "@/components/tables/EntityTable";
import StatusBadge from "@/components/entities/StatusBadge";
import EntityLink from "@/components/entities/EntityLink";
import ActionMenu, { ActionItem } from "@/components/entities/ActionMenu";
import { useEntityDrawer } from "@/hooks/useEntityDrawer";
import EntityDrawerHost from "@/components/drawers/EntityDrawerHost";
import { Search, RefreshCw, Copy, Check } from "lucide-react";

// ─── Type badge ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  TICKET:          { bg: "#eff6ff", color: "#1e40af" },
  EXPERIENCE:      { bg: "#f0fdf4", color: "#166534" },
  MEMBERSHIP:      { bg: "#f5f3ff", color: "#5b21b6" },
  DINING:          { bg: "#fff7ed", color: "#9a3412" },
  PRIVATE_BOOKING: { bg: "#fdf2f4", color: "#9f1239" },
  EVENT:           { bg: "#ecfdf5", color: "#065f46" },
  OTHER:           { bg: "#f9fafb", color: "#6b7280" },
};

const CHANNEL_COLORS: Record<string, { bg: string; color: string }> = {
  DIRECT:    { bg: "#f9fafb", color: "#374151" },
  INFLUENCER:{ bg: "#fdf2f8", color: "#9d174d" },
  REFERRER:  { bg: "#eff6ff", color: "#1e40af" },
  PARTNER:   { bg: "#f5f3ff", color: "#5b21b6" },
  ADMIN:     { bg: "#fffbeb", color: "#92400e" },
  QR:        { bg: "#f0fdf4", color: "#166534" },
  OTHER:     { bg: "#f9fafb", color: "#6b7280" },
};

function MicroBadge({ value, map }: { value: string; map: Record<string, { bg: string; color: string }> }) {
  const s = map[value] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 7px",
      borderRadius: 12,
      background: s.bg,
      color: s.color,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Copy order number"
      style={{
        background: "none", border: "none", cursor: "pointer",
        padding: "2px 4px", borderRadius: 4, color: "var(--color-text-muted)",
        display: "inline-flex", alignItems: "center",
      }}
    >
      {copied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
    </button>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

interface SummaryData {
  total: number;
  paid: number;
  pending: number;
  cancelled: number;
  refunded: number;
  totalRevenueCents: number;
  totalCommissionCents: number;
  currency: string;
}

function OrdersSummaryBar({ data, fmtMoney }: { data: SummaryData | null; fmtMoney: (c: number) => string }) {
  if (!data) return null;
  const items = [
    { label: "Total Orders",   value: String(data.total) },
    { label: "Paid",           value: String(data.paid), accent: "success" },
    { label: "Pending",        value: String(data.pending), accent: "warn" },
    { label: "Revenue",        value: fmtMoney(data.totalRevenueCents), accent: "primary" },
    { label: "Commission",     value: fmtMoney(data.totalCommissionCents), accent: "muted" },
  ];
  return (
    <div style={{
      display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18,
      padding: "14px 16px",
      background: "var(--color-surface)",
      border: "1px solid var(--color-border-light)",
      borderRadius: 10,
    }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 80 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            {item.label}
          </span>
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: item.accent === "success" ? "var(--color-success)"
              : item.accent === "warn"    ? "#92400e"
              : item.accent === "primary" ? "var(--color-primary)"
              : "var(--color-text)",
          }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const ORDER_TYPES = ["TICKET", "EXPERIENCE", "MEMBERSHIP", "DINING", "PRIVATE_BOOKING", "EVENT", "OTHER"];
const CHANNELS    = ["DIRECT", "INFLUENCER", "REFERRER", "PARTNER", "ADMIN", "QR", "OTHER"];
const STATUSES    = ["PAID", "PENDING", "CANCELLED", "REFUNDED", "FAILED"];

function OrdersPageContent() {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const { drawerType, drawerId, openDrawer, closeDrawer } = useEntityDrawer();

  const [orders, setOrders]     = useState<any[]>([]);
  const [summary, setSummary]   = useState<SummaryData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter]     = useState("");
  const [typeFilter, setTypeFilter]         = useState("");
  const [channelFilter, setChannelFilter]   = useState("");

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" });

  const fmtMoney = (cents: number, currency = "USD") =>
    new Intl.NumberFormat(dateLocale, { style: "currency", currency }).format(cents / 100);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (search)        p.set("q", search);
    if (statusFilter)  p.set("status", statusFilter);
    if (typeFilter)    p.set("orderType", typeFilter);
    if (channelFilter) p.set("channel", channelFilter);
    p.set("pageSize", "100");
    return p.toString();
  }, [search, statusFilter, typeFilter, channelFilter]);

  const load = useCallback(() => {
    setLoading(true);
    const qs = buildQuery();
    Promise.all([
      fetch(`/api/v1/admin/orders?${qs}`).then((r) => r.json()),
      fetch("/api/v1/admin/orders/summary").then((r) => r.json()),
    ])
      .then(([ordersRes, summaryRes]) => {
        if (ordersRes.ok)  setOrders(ordersRes.data || []);
        if (summaryRes.ok) setSummary(summaryRes.data);
      })
      .finally(() => setLoading(false));
  }, [buildQuery]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 180_000);

  const buildActions = (order: any): ActionItem[] => {
    const items: ActionItem[] = [
      {
        key: "open",
        label: t("admin", "viewDetails"),
        onClick: () => openDrawer("order", order.id),
      },
    ];

    if (order.status === "PAID") {
      items.push({
        key: "resend",
        label: t("admin", "resendConfirmation"),
        onClick: async () => {
          await fetch(`/api/v1/admin/orders/${order.id}/resend-confirmation`, { method: "POST" });
        },
      });
      items.push({
        key: "refund",
        label: t("admin", "refund"),
        danger: true,
        onClick: async () => {
          if (!confirm(t("admin", "refundConfirm"))) return;
          await fetch("/api/v1/admin/orders/refund", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id, amountCents: order.totalCents }),
          });
          load();
        },
      });
      items.push({
        key: "cancel",
        label: t("admin", "cancelOrder"),
        danger: true,
        onClick: async () => {
          if (!confirm(t("admin", "cancelConfirm"))) return;
          await fetch(`/api/v1/admin/orders/${order.id}/cancel`, { method: "POST" });
          load();
        },
      });
    }

    if (order.status === "CANCELLED") {
      items.push({
        key: "reopen",
        label: t("admin", "reopenOrder"),
        onClick: async () => {
          await fetch(`/api/v1/admin/orders/${order.id}/reopen`, { method: "POST" });
          load();
        },
      });
    }

    return items;
  };

  const columns: EntityColumn<any>[] = [
    {
      key: "orderNumber",
      header: "Order #",
      width: "120px",
      render: (o) => (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--color-text)" }}>
            {o.orderNumber ?? `···${o.id.slice(-6)}`}
          </span>
          {o.orderNumber && <CopyButton text={o.orderNumber} />}
        </div>
      ),
    },
    {
      key: "user",
      header: t("admin", "user"),
      render: (o) =>
        o.user ? (
          <EntityLink
            entityType="user"
            entityId={o.user.id}
            label={o.user.name || o.user.email}
            sublabel={o.user.name ? o.user.email : undefined}
            onOpen={(_, id) => openDrawer("user", id)}
          />
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        ),
    },
    {
      key: "orderType",
      header: "Type",
      width: "110px",
      render: (o) => o.orderType ? <MicroBadge value={o.orderType} map={TYPE_COLORS} /> : null,
    },
    {
      key: "series",
      header: "Experience",
      render: (o) =>
        o.series ? (
          <EntityLink
            entityType="series"
            entityId={o.series.id}
            label={o.series.title}
            onOpen={(_, id) => openDrawer("series", id)}
          />
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        ),
    },
    {
      key: "channel",
      header: "Channel",
      width: "100px",
      render: (o) => o.channel ? <MicroBadge value={o.channel} map={CHANNEL_COLORS} /> : null,
    },
    {
      key: "sourceName",
      header: "Source",
      width: "110px",
      render: (o) =>
        o.sourceName ? (
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{o.sourceName}</span>
        ) : (
          <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>
        ),
    },
    {
      key: "totalCents",
      header: "Revenue",
      width: "90px",
      sortable: true,
      render: (o) => (
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          {fmtMoney(o.totalCents, o.currency)}
        </span>
      ),
    },
    {
      key: "commissionCents",
      header: "Commission",
      width: "100px",
      render: (o) =>
        o.commissionCents > 0 ? (
          <span style={{ fontSize: 12, color: "#9d174d" }}>
            {fmtMoney(o.commissionCents, o.currency)}
          </span>
        ) : (
          <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>
        ),
    },
    {
      key: "status",
      header: t("admin", "status"),
      width: "116px",
      sortable: true,
      render: (o) => <StatusBadge status={o.status} dot />,
    },
    {
      key: "createdAt",
      header: t("admin", "date"),
      width: "100px",
      sortable: true,
      render: (o) => (
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {fmtDate(o.placedAt || o.createdAt)}
        </span>
      ),
    },
    {
      key: "_actions",
      header: "",
      width: "44px",
      render: (o) => <ActionMenu items={buildActions(o)} align="right" />,
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>{t("admin", "orders")}</h2>
        </div>
        <button className="btn btn-sm" onClick={load} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} />
        </button>
      </div>

      <OrdersSummaryBar data={summary} fmtMoney={(c) => fmtMoney(c)} />

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 2, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", pointerEvents: "none" }} />
          <input
            className="form-input"
            placeholder={`${t("admin", "search")}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13 }}
          />
        </div>
        <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "auto", minWidth: 130, fontSize: 13 }}>
          <option value="">{t("admin", "allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: "auto", minWidth: 120, fontSize: 13 }}>
          <option value="">All Types</option>
          {ORDER_TYPES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select className="form-input" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ width: "auto", minWidth: 120, fontSize: 13 }}>
          <option value="">All Channels</option>
          {CHANNELS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <EntityTable
        rows={orders}
        columns={columns}
        rowKey={(o) => o.id}
        onRowClick={(o) => openDrawer("order", o.id)}
        emptyMessage={t("admin", "noOrdersFound")}
        loading={loading}
      />

      <EntityDrawerHost
        drawerType={drawerType}
        drawerId={drawerId}
        onClose={closeDrawer}
        onUpdated={load}
      />
    </>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--color-text-muted)", padding: 24 }}>Loading…</p>}>
      <OrdersPageContent />
    </Suspense>
  );
}
