"use client";

import { useEffect, useState, useCallback } from "react";
import RightDetailDrawer from "./RightDetailDrawer";
import StatusBadge from "@/components/entities/StatusBadge";
import EntityLink from "@/components/entities/EntityLink";
import ActionMenu, { ActionItem } from "@/components/entities/ActionMenu";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import {
  RefreshCw, Mail, XCircle, RotateCcw, ShoppingBag, CreditCard,
  Package, Copy, Check, StickyNote, Tag, Zap, ExternalLink, AlertTriangle,
} from "lucide-react";

type Tab = "overview" | "attribution" | "items" | "payment" | "timeline";

interface OrderDrawerProps {
  orderId: string | null;
  onClose: () => void;
  onUserOpen?: (userId: string) => void;
  onSeriesOpen?: (seriesId: string) => void;
  onUpdated?: () => void;
}

// ─── Type / Channel badges ────────────────────────────────────────────────────

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
      display: "inline-block", padding: "2px 8px", borderRadius: 12,
      background: s.bg, color: s.color, fontSize: 10, fontWeight: 700,
      letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
    }}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

// ─── Add Note modal ───────────────────────────────────────────────────────────

function AddNoteModal({ orderId, onClose, onSaved }: { orderId: string; onClose: () => void; onSaved: () => void }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/admin/orders/${orderId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const d = await r.json();
      if (d.ok) { onSaved(); onClose(); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--color-surface)", borderRadius: 12, padding: 24, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Add Note</h3>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Enter note…"
          rows={4}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13, resize: "vertical", boxSizing: "border-box", background: "var(--color-bg)" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={saving || !body.trim()}>
            {saving ? "Saving…" : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderDrawer({
  orderId,
  onClose,
  onUserOpen,
  onSeriesOpen,
  onUpdated,
}: OrderDrawerProps) {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const [order, setOrder]         = useState<any>(null);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState<Tab>("overview");
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showNote, setShowNote]   = useState(false);

  const [commissions, setCommissions]   = useState<any[] | null>(null);
  const [events, setEvents]             = useState<any[] | null>(null);
  const [loadingAttr, setLoadingAttr]   = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/admin/orders/${orderId}`);
      const d = await r.json();
      if (d.ok) setOrder(d.data);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fetchAttribution = useCallback(async () => {
    if (!orderId) return;
    setLoadingAttr(true);
    try {
      const r = await fetch(`/api/v1/admin/orders/${orderId}/commissions`);
      const d = await r.json();
      if (d.ok) setCommissions(d.data);
    } finally {
      setLoadingAttr(false);
    }
  }, [orderId]);

  const fetchTimeline = useCallback(async () => {
    if (!orderId) return;
    setLoadingTimeline(true);
    try {
      const r = await fetch(`/api/v1/admin/orders/${orderId}/events`);
      const d = await r.json();
      if (d.ok) setEvents(d.data);
    } finally {
      setLoadingTimeline(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId) {
      setTab("overview");
      setOrder(null);
      setCommissions(null);
      setEvents(null);
      setActionMsg(null);
      fetchOrder();
    }
  }, [orderId, fetchOrder]);

  useEffect(() => {
    if (tab === "attribution" && commissions === null) fetchAttribution();
    if (tab === "timeline" && events === null) fetchTimeline();
  }, [tab, commissions, events, fetchAttribution, fetchTimeline]);

  const flash = (text: string, ok = true) => {
    setActionMsg({ text, ok });
    setTimeout(() => setActionMsg(null), 3500);
  };

  const doAction = async (endpoint: string, method = "POST") => {
    const r = await fetch(`/api/v1/admin/orders/${orderId}/${endpoint}`, { method });
    const d = await r.json();
    if (d.ok) {
      flash(t("admin", "actionSuccess"));
      fetchOrder();
      onUpdated?.();
    } else {
      flash(d.error || t("admin", "actionFailed"), false);
    }
  };

  const buildActions = (): ActionItem[] => {
    if (!order) return [];
    const items: ActionItem[] = [];

    items.push({
      key: "addNote",
      label: "Add Note",
      icon: <StickyNote size={13} />,
      onClick: () => setShowNote(true),
    });

    if (order.status === "PAID") {
      items.push({
        key: "resend",
        label: t("admin", "resendConfirmation"),
        icon: <Mail size={13} />,
        onClick: () => doAction("resend-confirmation"),
      });
      items.push({
        key: "refund",
        label: "Full Refund",
        icon: <RefreshCw size={13} />,
        danger: true,
        onClick: async () => {
          if (!confirm(t("admin", "refundConfirm"))) return;
          const r = await fetch("/api/v1/admin/orders/refund", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id, amountCents: order.totalCents }),
          });
          const d = await r.json();
          if (d.ok) { flash(t("admin", "refunded")); fetchOrder(); onUpdated?.(); }
          else flash(d.error || t("admin", "actionFailed"), false);
        },
      });
      items.push({
        key: "cancel",
        label: t("admin", "cancelOrder"),
        icon: <XCircle size={13} />,
        danger: true,
        onClick: async () => {
          if (!confirm(t("admin", "cancelConfirm"))) return;
          doAction("cancel");
        },
      });
    }

    if (order.status === "PENDING") {
      items.push({
        key: "cancel",
        label: t("admin", "cancelOrder"),
        icon: <XCircle size={13} />,
        danger: true,
        onClick: async () => {
          if (!confirm(t("admin", "cancelConfirm"))) return;
          doAction("cancel");
        },
      });
    }

    if (order.status === "CANCELLED") {
      items.push({
        key: "reopen",
        label: t("admin", "reopenOrder"),
        icon: <RotateCcw size={13} />,
        onClick: () => doAction("reopen"),
      });
    }

    return items;
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const fmtDateShort = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" });

  const fmtMoney = (cents: number, currency = "USD") =>
    new Intl.NumberFormat(dateLocale, { style: "currency", currency }).format(cents / 100);

  const TABS = [
    { key: "overview",     label: "Overview" },
    { key: "attribution",  label: "Attribution" },
    { key: "items",        label: t("admin", "lineItems"), badge: order?.lineItems?.length },
    { key: "payment",      label: t("admin", "payment") },
    { key: "timeline",     label: t("admin", "timeline") },
  ];

  const drawerTitle = order
    ? (order.orderNumber || `Order ···${order.id.slice(-8)}`)
    : t("admin", "order");

  const drawerBadge = order ? (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <StatusBadge status={order.status} dot />
      {order.orderType && <MicroBadge value={order.orderType} map={TYPE_COLORS} />}
      {order.channel && <MicroBadge value={order.channel} map={CHANNEL_COLORS} />}
    </div>
  ) : undefined;

  return (
    <>
      {showNote && orderId && (
        <AddNoteModal
          orderId={orderId}
          onClose={() => setShowNote(false)}
          onSaved={() => {
            setEvents(null);
            fetchTimeline();
          }}
        />
      )}
      <RightDetailDrawer
        open={!!orderId}
        onClose={onClose}
        title={drawerTitle}
        subtitle={order?.id ?? undefined}
        badge={drawerBadge}
        tabs={TABS as any}
        activeTab={tab}
        onTabChange={(k) => setTab(k as Tab)}
        width={580}
        loading={loading}
        footer={
          order ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", flex: 1 }}>
                {fmtMoney(order.totalCents, order.currency)}
              </span>
              <ActionMenu items={buildActions()} align="right" />
            </div>
          ) : undefined
        }
      >
        {actionMsg && (
          <div style={{
            marginBottom: 14, padding: "9px 14px", borderRadius: 8,
            background: actionMsg.ok ? "var(--color-success-bg)" : "var(--color-danger-bg)",
            color: actionMsg.ok ? "var(--color-success)" : "var(--color-danger)",
            fontSize: 13, fontWeight: 500,
          }}>
            {actionMsg.text}
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {order && tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Section title="Order Summary">
              <DetailRow label="Order #">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{order.orderNumber ?? `···${order.id.slice(-8)}`}</span>
                  {order.orderNumber && <CopyInline text={order.orderNumber} />}
                </div>
              </DetailRow>
              <DetailRow label="Status"><StatusBadge status={order.status} dot /></DetailRow>
              <DetailRow label="Type">
                {order.orderType && <MicroBadge value={order.orderType} map={TYPE_COLORS} />}
              </DetailRow>
              <DetailRow label="Channel">
                {order.channel && <MicroBadge value={order.channel} map={CHANNEL_COLORS} />}
              </DetailRow>
              {order.placedAt && <DetailRow label="Placed">{fmtDateShort(order.placedAt)}</DetailRow>}
              {order.paidAt && <DetailRow label="Paid">{fmtDateShort(order.paidAt)}</DetailRow>}
            </Section>

            <Section title="Product Context">
              {order.series && (
                <EntityLink
                  entityType="series"
                  entityId={order.series.id}
                  label={order.series.title}
                  sublabel={order.series.slug}
                  variant="card"
                  onOpen={(_, id) => onSeriesOpen?.(id)}
                />
              )}
              {order.session && (
                <>
                  <DetailRow label="Session">{fmtDateShort(order.session.startsAt)}</DetailRow>
                  <DetailRow label="Session Status"><StatusBadge status={order.session.status} /></DetailRow>
                </>
              )}
              {(order.coversCount > 0) && (
                <DetailRow label="Covers">{order.coversCount}</DetailRow>
              )}
            </Section>

            <Section title={t("admin", "customer")}>
              <EntityLink
                entityType="user"
                entityId={order.user.id}
                label={order.user.name || order.user.email}
                sublabel={order.user.name ? order.user.email : undefined}
                variant="card"
                onOpen={(_, id) => onUserOpen?.(id)}
              />
              {order.userOrderCount > 1 && (
                <DetailRow label="Total Orders">{order.userOrderCount}</DetailRow>
              )}
            </Section>

            <Section title="Financial Breakdown">
              <DetailRow label="Subtotal">{fmtMoney(order.subtotalCents, order.currency)}</DetailRow>
              {order.discountCents > 0 && (
                <DetailRow label="Discount">
                  <span style={{ color: "#10b981" }}>-{fmtMoney(order.discountCents, order.currency)}</span>
                </DetailRow>
              )}
              {order.feesCents > 0 && <DetailRow label="Fees">{fmtMoney(order.feesCents, order.currency)}</DetailRow>}
              {order.taxCents > 0 && <DetailRow label="Tax">{fmtMoney(order.taxCents, order.currency)}</DetailRow>}
              <DetailRow label="Total"><strong>{fmtMoney(order.totalCents, order.currency)}</strong></DetailRow>
              {order.commissionCents > 0 && (
                <DetailRow label="Commission">
                  <span style={{ color: "#9d174d" }}>{fmtMoney(order.commissionCents, order.currency)}</span>
                </DetailRow>
              )}
              {order.netRevenueCents > 0 && (
                <DetailRow label="Net Revenue">
                  <strong style={{ color: "var(--color-success)" }}>{fmtMoney(order.netRevenueCents, order.currency)}</strong>
                </DetailRow>
              )}
              {order.couponCode && (
                <DetailRow label="Coupon">
                  <code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>{order.couponCode}</code>
                </DetailRow>
              )}
            </Section>
          </div>
        )}

        {/* ── ATTRIBUTION TAB ── */}
        {order && tab === "attribution" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Section title="Source">
              {order.sourceType ? (
                <>
                  <DetailRow label="Source Type"><StatusBadge status={order.attributionSource} /></DetailRow>
                  {order.sourceName && <DetailRow label="Name">{order.sourceName}</DetailRow>}
                  {order.attribution?.refCode && (
                    <DetailRow label="Ref Code">
                      <code style={{ fontSize: 11, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>{order.attribution.refCode}</code>
                    </DetailRow>
                  )}
                  {order.attributedInfluencer && (
                    <DetailRow label="Influencer">
                      <EntityLink
                        entityType="user"
                        entityId={order.attributedInfluencer.user.id}
                        label={order.attributedInfluencer.user.name || order.attributedInfluencer.user.email}
                        onOpen={(_, id) => onUserOpen?.(id)}
                      />
                    </DetailRow>
                  )}
                </>
              ) : (
                <EmptyState icon={<Tag size={24} />} text="No attribution data for this order" />
              )}
            </Section>

            {loadingAttr && <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Loading commissions…</div>}

            {!loadingAttr && commissions !== null && (
              <Section title="Commission Records">
                {commissions.length === 0 ? (
                  <EmptyState icon={<Zap size={24} />} text="No commission records for this order" />
                ) : (
                  commissions.map((c: any) => (
                    <div key={c.id} style={{ padding: "12px 14px", background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border-light)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <StatusBadge status={c.type} />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{fmtMoney(c.amountCents, c.currency)}</span>
                      </div>
                      {c.influencer && (
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {c.influencer.displayName || c.influencer.user?.name} · {(c.influencer.commissionRateBps / 100).toFixed(1)}%
                        </div>
                      )}
                      {c.note && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>{c.note}</div>}
                    </div>
                  ))
                )}
              </Section>
            )}
          </div>
        )}

        {/* ── LINE ITEMS TAB ── */}
        {order && tab === "items" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Section title="Line Items">
              {order.lineItems.length === 0 ? (
                <EmptyState icon={<Package size={24} />} text={t("admin", "noLineItems")} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {order.lineItems.map((item: any) => (
                    <div key={item.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      padding: "12px 14px", background: "var(--color-bg)",
                      borderRadius: 8, border: "1px solid var(--color-border-light)",
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                          {item.itemType}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {item.ticketType?.name || item.nameSnapshot || t("admin", "ticket")}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                          {item.qty} × {fmtMoney(item.unitPriceCents, order.currency)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {fmtMoney(item.totalCents, order.currency)}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid var(--color-border)", marginTop: 2, fontWeight: 700, fontSize: 14 }}>
                    <span>{t("admin", "total")}</span>
                    <span>{fmtMoney(order.totalCents, order.currency)}</span>
                  </div>
                </div>
              )}
            </Section>

            {order.tickets && order.tickets.length > 0 && (
              <Section title={`Issued Tickets (${order.tickets.length})`}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {order.tickets.map((ticket: any) => (
                    <div key={ticket.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", background: "var(--color-bg)",
                      borderRadius: 8, border: "1px solid var(--color-border-light)",
                    }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <code style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-text-secondary)" }}>
                            {ticket.code}
                          </code>
                          <CopyInline text={ticket.code} />
                        </div>
                        {ticket.checkedInAt && (
                          <div style={{ fontSize: 11, color: "#059669", marginTop: 3 }}>
                            ✓ Checked in {fmtDate(ticket.checkedInAt)}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={ticket.ticketStatus} dot />
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ── PAYMENT TAB ── */}
        {order && tab === "payment" && (() => {
          const p = order.payment;
          const isDemo = p?.provider === "DEMO";
          const isAuthNet = p?.provider === "AUTHORIZE_NET";
          const refundable =
            !!p &&
            isAuthNet &&
            !!p.authNetTransId &&
            p.status === "SUCCEEDED" &&
            (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED");
          const blockedReason =
            !p
              ? "No payment record on this order"
              : isDemo
              ? "Demo payment — no gateway transaction to refund or void"
              : isAuthNet && !p.authNetTransId
              ? "Missing Authorize.net transaction id (cannot refund or void)"
              : isAuthNet && p.status !== "SUCCEEDED"
              ? `Payment status is ${p.status}`
              : null;
          const refundFailedEvent = (events ?? []).find((e: any) =>
            ["PAYMENT_FAILED", "ORDER_REFUNDED"].includes(e.eventType) &&
            (e.eventLabel || "").toLowerCase().includes("fail")
          );
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {p ? (
                <>
                  <Section title={t("admin", "paymentDetails")}>
                    <DetailRow label={t("admin", "paymentId")}>
                      <code style={{ fontSize: 11, color: "var(--color-text-muted)" }}>···{p.id.slice(-10)}</code>
                    </DetailRow>
                    <DetailRow label={t("admin", "status")}>
                      <StatusBadge status={p.status} dot />
                    </DetailRow>
                    <DetailRow label={t("admin", "provider")}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {p.provider}
                        {isDemo && (
                          <span style={{ padding: "1px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", fontSize: 10, fontWeight: 700 }}>
                            DEMO
                          </span>
                        )}
                      </span>
                    </DetailRow>
                    <DetailRow label={t("admin", "amount")}>{fmtMoney(p.amountCents, p.currency)}</DetailRow>
                    {p.authNetTransId && (
                      <DetailRow label={t("admin", "transactionId")}>
                        <code style={{ fontSize: 11 }}>{p.authNetTransId}</code>
                      </DetailRow>
                    )}
                    {p.authNetRefId && (
                      <DetailRow label={t("admin", "refId")}>
                        <code style={{ fontSize: 11 }}>{p.authNetRefId}</code>
                      </DetailRow>
                    )}
                    <DetailRow label={t("admin", "date")}>{fmtDate(p.createdAt)}</DetailRow>
                  </Section>

                  {isDemo && (
                    <div style={{
                      display: "flex", gap: 8, alignItems: "flex-start",
                      padding: 12, background: "#fffbeb",
                      border: "1px solid #fde68a", borderRadius: 8, color: "#92400e", fontSize: 13,
                    }}>
                      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Demo payment</div>
                        <div>No real gateway transaction was created. Refund and void are unavailable for this order.</div>
                      </div>
                    </div>
                  )}

                  {refundable && (
                    <div style={{
                      padding: 12, background: "#f0fdf4",
                      border: "1px solid #bbf7d0", borderRadius: 8, color: "#166534", fontSize: 13,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Refund available</div>
                      <div style={{ marginBottom: 8 }}>
                        This order can be refunded against gateway transaction <code>{p.authNetTransId}</code>.
                        Use <strong>Full Refund</strong> in the actions menu, or open payment controls for partial refunds.
                      </div>
                    </div>
                  )}

                  {!refundable && !isDemo && blockedReason && (
                    <div style={{
                      padding: 12, background: "#fef2f2",
                      border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>Refund blocked</div>
                      <div>{blockedReason}</div>
                    </div>
                  )}

                  {refundFailedEvent && (
                    <div style={{
                      padding: 12, background: "#fef2f2",
                      border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>Last payment action failed</div>
                      <div>{refundFailedEvent.eventLabel}</div>
                    </div>
                  )}

                  <a
                    href="/admin/payments?tab=refunds"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 12px", borderRadius: 6,
                      border: "1px solid var(--color-border, #e2e8f0)",
                      color: "var(--color-text-primary, #0f172a)",
                      fontSize: 13, fontWeight: 600, textDecoration: "none", alignSelf: "flex-start",
                    }}
                  >
                    Open payment controls <ExternalLink size={12} />
                  </a>
                </>
              ) : (
                <EmptyState icon={<CreditCard size={24} />} text={t("admin", "noPaymentRecord")} />
              )}
            </div>
          );
        })()}

        {/* ── TIMELINE TAB ── */}
        {order && tab === "timeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {loadingTimeline && (
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, padding: 12 }}>Loading timeline…</div>
            )}
            {!loadingTimeline && events !== null && events.length === 0 && (
              <EmptyState icon={<ShoppingBag size={24} />} text="No events recorded yet" />
            )}
            {!loadingTimeline && events !== null && events.length > 0 && events.map((ev: any, i: number) => (
              <TimelineEvent
                key={ev.id}
                icon={getEventIcon(ev.eventType)}
                label={ev.eventLabel}
                actor={ev.performedBy}
                date={fmtDate(ev.createdAt)}
                color={getEventColor(ev.eventType)}
                isLast={i === events.length - 1}
              />
            ))}
          </div>
        )}
      </RightDetailDrawer>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEventIcon(type: string) {
  switch (type) {
    case "ORDER_CREATED":     return <ShoppingBag size={13} />;
    case "PAYMENT_SUCCEEDED": return <CreditCard size={13} />;
    case "PAYMENT_FAILED":    return <XCircle size={13} />;
    case "ORDER_CANCELLED":   return <XCircle size={13} />;
    case "ORDER_REFUNDED":    return <RefreshCw size={13} />;
    case "ORDER_REOPENED":    return <RotateCcw size={13} />;
    case "TICKET_ISSUED":     return <Package size={13} />;
    case "NOTE_ADDED":        return <StickyNote size={13} />;
    case "CONFIRMATION_SENT": return <Mail size={13} />;
    default:                  return <Zap size={13} />;
  }
}

function getEventColor(type: string) {
  switch (type) {
    case "ORDER_CREATED":     return "#6b7280";
    case "PAYMENT_SUCCEEDED": return "#065f46";
    case "PAYMENT_FAILED":    return "#9f1239";
    case "ORDER_CANCELLED":   return "#9f1239";
    case "ORDER_REFUNDED":    return "#9f1239";
    case "ORDER_REOPENED":    return "#1e40af";
    case "TICKET_ISSUED":     return "#1e40af";
    case "NOTE_ADDED":        return "#5b21b6";
    case "CONFIRMATION_SENT": return "#065f46";
    default:                  return "#6b7280";
  }
}

function CopyInline({ text }: { text: string }) {
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
      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, color: "var(--color-text-muted)", display: "inline-flex", alignItems: "center" }}
    >
      {copied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
    </button>
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

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
      <div style={{ marginBottom: 8, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}

const MEMBERSHIP_TIER_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  FOUNDER:  { bg: "#fef3c7", color: "#92400e", label: "Founder" },
  PATRON:   { bg: "#ede9fe", color: "#5b21b6", label: "Patron" },
  INSIDER:  { bg: "#dbeafe", color: "#1e40af", label: "Insider" },
  EXPLORER: { bg: "#f0fdf4", color: "#166534", label: "Explorer" },
};

function MembershipBadge({ tier }: { tier: string }) {
  const style = MEMBERSHIP_TIER_STYLES[tier] ?? { bg: "#f3f4f6", color: "#6b7280", label: tier };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 99,
        background: style.bg,
        color: style.color,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
      }}
    >
      {style.label}
    </span>
  );
}

function TimelineEvent({ icon, label, actor, date, color, isLast }: {
  icon: React.ReactNode; label: string; actor?: string; date: string; color: string; isLast?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, paddingBottom: isLast ? 0 : 20, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: color + "20", color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        {!isLast && <div style={{ width: 1, flex: 1, background: "var(--color-border)", marginTop: 4 }} />}
      </div>
      <div style={{ paddingTop: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{label}</div>
        {actor && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>by {actor}</div>}
        {date && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>{date}</div>}
      </div>
    </div>
  );
}
