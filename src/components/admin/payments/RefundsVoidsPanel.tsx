"use client";

import { useEffect, useMemo, useState } from "react";

interface AuditRow {
  id: string;
  action: string;
  createdAt: string;
  orderId: string | null;
  amountCents: number | null;
  gatewayMessage: string | null;
}

interface Row {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  provider: string | null;
  paymentStatus: string | null;
  totalCents: number;
  currency: string;
  paidAt: string | null;
  createdAt: string;
  guestName: string | null;
  guestEmail: string | null;
  authNetTransIdMasked: string | null;
  gatewayTransIdMasked?: string | null;
  eligibility: {
    refundEligible: boolean;
    voidEligible: boolean;
    demoOnly: boolean;
    blockedReason: string | null;
  };
}

function fmtMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Pill({
  variant,
  children,
}: {
  variant: "ok" | "warn" | "err" | "neutral";
  children: React.ReactNode;
}) {
  const colors =
    variant === "ok"
      ? { bg: "#dcfce7", fg: "#166534" }
      : variant === "warn"
      ? { bg: "#fef3c7", fg: "#92400e" }
      : variant === "err"
      ? { bg: "#fee2e2", fg: "#991b1b" }
      : { bg: "#e2e8f0", fg: "#1e293b" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: colors.bg,
        color: colors.fg,
      }}
    >
      {children}
    </span>
  );
}

function actionLabel(a: string): { label: string; variant: "ok" | "err" | "neutral" } {
  const friendly = a
    .replace("order.refund", "Refund")
    .replace("order.void", "Void")
    .replace("payment.gateway.authnet.update", "Gateway credentials updated")
    .replace("payment.gateway.authnet.test", "Gateway test")
    .replace("order.", "");
  if (a.endsWith(".succeeded") || a === "payment.gateway.authnet.update")
    return {
      label: friendly.replace(".succeeded", " ✓"),
      variant: "ok",
    };
  if (a.endsWith(".failed"))
    return {
      label: friendly.replace(".failed", " ✗"),
      variant: "err",
    };
  return { label: friendly, variant: "neutral" };
}

export default function RefundsVoidsPanel({
  audits,
  onOpenOrder,
}: {
  audits: AuditRow[];
  onOpenOrder?: (orderId: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    const url = `/api/v1/admin/payments/refundable-orders${
      debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : ""
    }`;
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then((res) => res.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Failed to load");
        setRows(j.data.rows);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSearch]);

  function openOrder(id: string) {
    if (onOpenOrder) onOpenOrder(id);
    else window.location.href = `/admin/orders?orderId=${id}`;
  }

  const refundOnlyAudits = useMemo(
    () =>
      audits.filter((a) =>
        [
          "order.refund.succeeded",
          "order.refund.failed",
          "order.void.succeeded",
          "order.void.failed",
          "payment.gateway.authnet.update",
          "payment.gateway.authnet.test.succeeded",
          "payment.gateway.authnet.test.failed",
          "payment.gateway.cybersource.update",
          "payment.gateway.cybersource.test.succeeded",
          "payment.gateway.cybersource.test.failed",
          "payment.gateway.active.changed",
          "payment.gateway.active.changed.rejected",
        ].includes(a.action)
      ),
    [audits]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section
        style={{
          background: "#f1f5f9",
          border: "1px solid #cbd5e1",
          color: "#0f172a",
          padding: "10px 14px",
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <strong>Website checkout orders only.</strong> Refunds and voids on this page apply to
        tickets, experiences, events, and memberships purchased online. POS / table payments are
        reconciled through INVU.
        <div style={{ marginTop: 4, fontSize: 12, color: "#475569" }}>
          Eligibility shown below is based on order &amp; payment record state. The gateway makes
          the final decision (e.g. void vs refund depends on settlement timing).
        </div>
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            Recent refundable website orders
          </h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order #, name, email, transaction id, or ticket code"
            style={{
              flex: "1 1 320px",
              maxWidth: 480,
              padding: "8px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              fontSize: 13,
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: 10,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {loading && !rows && (
          <div style={{ color: "#64748b", fontSize: 13, padding: 8 }}>Loading orders…</div>
        )}

        {rows && rows.length === 0 && (
          <div style={{ color: "#64748b", fontSize: 13, padding: 8 }}>
            {debouncedSearch ? "No orders match that search." : "No refundable orders yet."}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#475569" }}>
                  <th style={{ padding: "8px 6px" }}>Order #</th>
                  <th style={{ padding: "8px 6px" }}>Guest</th>
                  <th style={{ padding: "8px 6px" }}>Type</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                  <th style={{ padding: "8px 6px" }}>Provider</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Amount</th>
                  <th style={{ padding: "8px 6px" }}>Paid</th>
                  <th style={{ padding: "8px 6px" }}>Eligibility</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const elig = r.eligibility;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 6px", fontFamily: "monospace", color: "#0f172a" }}>
                        {r.orderNumber}
                      </td>
                      <td style={{ padding: "8px 6px", color: "#334155" }}>
                        <div style={{ fontWeight: 500 }}>{r.guestName ?? "—"}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{r.guestEmail ?? ""}</div>
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <Pill variant="neutral">{r.orderType}</Pill>
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <Pill variant={r.status === "PAID" ? "ok" : "warn"}>{r.status}</Pill>
                      </td>
                      <td style={{ padding: "8px 6px", color: "#475569", fontSize: 12 }}>
                        <div>{r.provider ?? "—"}</div>
                        {(r.gatewayTransIdMasked ?? r.authNetTransIdMasked) && (
                          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                            {r.gatewayTransIdMasked ?? r.authNetTransIdMasked}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "#0f172a", fontWeight: 600 }}>
                        {fmtMoney(r.totalCents, r.currency)}
                      </td>
                      <td style={{ padding: "8px 6px", color: "#475569", fontSize: 12 }}>
                        {fmtDate(r.paidAt)}
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        {elig.demoOnly ? (
                          <Pill variant="neutral">Demo only</Pill>
                        ) : elig.refundEligible || elig.voidEligible ? (
                          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {elig.refundEligible && (
                              <Pill variant="ok">Refund possible</Pill>
                            )}
                            {elig.voidEligible && <Pill variant="ok">Void possible</Pill>}
                          </span>
                        ) : (
                          <Pill variant="err">Blocked</Pill>
                        )}
                        {elig.blockedReason && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                            {elig.blockedReason}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        <button
                          type="button"
                          aria-label={`Open order ${r.orderNumber}`}
                          onClick={() => openOrder(r.id)}
                          style={{
                            padding: "5px 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 6,
                            background: "#fff",
                            color: "#0f172a",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Open order
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
          Recent refund / void activity
        </h2>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          <span>
            Refund route: <code>/api/v1/admin/orders/refund</code>
          </span>
          <span>
            Void route: <code>/api/v1/admin/orders/{`{id}`}/cancel</code>
          </span>
          <span>
            <Pill variant="ok">Gateway-first enforced</Pill>
          </span>
          <span>
            <Pill variant="ok">Partial refunds supported</Pill>
          </span>
        </div>

        {refundOnlyAudits.length === 0 && (
          <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
            No refund/void activity yet.
          </p>
        )}
        {refundOnlyAudits.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#475569" }}>
                  <th style={{ padding: "8px 6px" }}>When</th>
                  <th style={{ padding: "8px 6px" }}>Action</th>
                  <th style={{ padding: "8px 6px" }}>Order</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Amount</th>
                  <th style={{ padding: "8px 6px" }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {refundOnlyAudits.map((a) => {
                  const al = actionLabel(a.action);
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 6px", color: "#334155", fontSize: 12 }}>
                        {fmtDate(a.createdAt)}
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <Pill variant={al.variant}>{al.label}</Pill>
                      </td>
                      <td style={{ padding: "8px 6px", color: "#475569" }}>
                        {a.orderId ? (
                          <button
                            type="button"
                            onClick={() => openOrder(a.orderId!)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: "#1d4ed8",
                              cursor: "pointer",
                              fontFamily: "monospace",
                              fontSize: 12,
                            }}
                          >
                            ···{a.orderId.slice(-8)}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "#334155" }}>
                        {a.amountCents != null ? fmtMoney(a.amountCents) : "—"}
                      </td>
                      <td style={{ padding: "8px 6px", color: "#475569", fontSize: 12 }}>
                        {a.gatewayMessage ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
