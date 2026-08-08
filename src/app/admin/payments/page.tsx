"use client";

import { useEffect, useMemo, useState } from "react";
import AuthNetGatewayForm from "@/components/admin/payments/AuthNetGatewayForm";
import CybersourceGatewayForm from "@/components/admin/payments/CybersourceGatewayForm";
import RefundsVoidsPanel from "@/components/admin/payments/RefundsVoidsPanel";

type ActiveProvider = "AUTHORIZE_NET" | "CYBERSOURCE";
interface GatewayReadinessUI {
  provider: ActiveProvider;
  label: string;
  configured: boolean;
  blockers: string[];
  source: "db" | "env" | null;
  environment: "sandbox" | "test" | "production" | null;
  lastTest: { passed: boolean; testedAt: string | null } | null;
  selectable: boolean;
  lockedReason: string | null;
}
interface ActiveGatewaySnapshotUI {
  active: ActiveProvider;
  activeLabel: string;
  activeEnvironment: "sandbox" | "test" | "production" | null;
  ready: boolean;
  blockers: string[];
  source: "db" | "env" | null;
  providers: Record<ActiveProvider, GatewayReadinessUI>;
  updatedAt: string | null;
}

interface ReadinessData {
  payments: {
    apiLoginIdConfigured: boolean;
    transactionKeyConfigured: boolean;
    envConfigured: boolean;
    mode: string;
    isProduction: boolean;
    activeProviderBlockers?: string[];
  };
  activeGateway?: ActiveGatewaySnapshotUI | null;
  email: { resendApiKeyConfigured: boolean; fromEmailConfigured: boolean };
  auth: {
    nextAuthSecretConfigured: boolean;
    nextAuthUrlConfigured: boolean;
    publicAppUrlConfigured: boolean;
  };
  runtime: {
    redisConfigured: boolean;
    databaseUrlConfigured: boolean;
    nodeEnv: string;
  };
  flags: { demoModeEnabled: boolean };
  lastTests?: {
    authNet: { ok: boolean | null; message: string | null; timestamp: string | null };
    email: { ok: boolean | null; message: string | null; timestamp: string | null; to: string | null };
  };
  recentPaymentAudits?: Array<{
    id: string;
    action: string;
    createdAt: string;
    orderId: string | null;
    amountCents: number | null;
    gatewayMessage: string | null;
    actor: { id: string; name: string | null; email: string | null } | null;
    activeGatewayChange: {
      before: string | null;
      after: string | null;
      reason: string | null;
    } | null;
  }>;
  refunds?: {
    routePath: string;
    voidRoutePath: string;
    gatewayFirstEnforced: boolean;
    partialRefundsSupported: boolean;
    partialRefundOrderStatus: string;
  };
  ticketingRoutes?: {
    attendeesPage: string;
    staffCheckInPage: string;
    validateRoute: string;
    manualCheckInRoute: string;
    hostScanRoute: string;
    resendConfirmationRoute: string;
  };
  ticketing: {
    ticketModelReachable: boolean;
    ticketCount: number;
    rfid: { configured: boolean; note: string };
  };
}

interface TestState {
  loading: boolean;
  ok: boolean | null;
  message: string | null;
  timestamp: string | null;
}
const initTest: TestState = { loading: false, ok: null, message: null, timestamp: null };

const SECTIONS = [
  "Overview",
  "Payment Providers",
  "Authorize.net",
  "Cybersource",
  "Refunds & Voids",
  "Receipts & Email",
  "Tickets & QR",
  "System Checks",
  "Audit Trail",
] as const;
type Section = (typeof SECTIONS)[number];

function StatusPill({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: ok ? "#dcfce7" : "#fee2e2",
        color: ok ? "#166534" : "#991b1b",
      }}
    >
      {label ?? (ok ? "Configured" : "Missing")}
    </span>
  );
}
function WarnPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: "#fef3c7",
        color: "#92400e",
      }}
    >
      {children}
    </span>
  );
}
function NeutralPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: "#e2e8f0",
        color: "#1e293b",
      }}
    >
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <span style={{ color: "#334155" }}>{label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{title}</h2>
      {children}
    </section>
  );
}

function actionLabel(a: string): { label: string; ok: boolean } {
  if (a === "payment.gateway.active.changed") return { label: "active gateway changed ✓", ok: true };
  if (a === "payment.gateway.active.changed.rejected") return { label: "active gateway change rejected ✗", ok: false };
  if (a.endsWith(".succeeded")) return { label: a.replace("order.", "").replace(".succeeded", " ✓"), ok: true };
  if (a.endsWith(".failed")) return { label: a.replace("order.", "").replace(".failed", " ✗"), ok: false };
  return { label: a, ok: false };
}

function gatewayLabelShort(p: string | null): string {
  if (p === "AUTHORIZE_NET") return "Authorize.net";
  if (p === "CYBERSOURCE") return "Cybersource";
  return p ?? "—";
}

interface CybersourceSummary {
  enabled: boolean;
  configured: boolean;
  environment: "test" | "production";
  encryptionAvailable: boolean;
  credentialStatus: {
    merchantId: "missing" | "saved" | "optional";
    keyId: "missing" | "saved" | "optional";
    sharedSecret: "missing" | "saved" | "optional";
  };
  lastTest: { status: "passed" | "failed" | null; timestamp: string | null } | null;
}

export default function PaymentsPage() {
  const [data, setData] = useState<ReadinessData | null>(null);
  const [cybersource, setCybersource] = useState<CybersourceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>(() => {
    if (typeof window === "undefined") return "Overview";
    const t = new URL(window.location.href).searchParams.get("tab");
    if (t === "refunds") return "Refunds & Voids";
    if (t === "authnet") return "Authorize.net";
    if (t === "cybersource") return "Cybersource";
    if (t === "providers") return "Payment Providers";
    return "Overview";
  });
  const [authNetTest, setAuthNetTest] = useState<TestState>(initTest);
  const [emailTest, setEmailTest] = useState<TestState>(initTest);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<ActiveProvider | null>(
    null,
  );
  const [confirmProdAck, setConfirmProdAck] = useState(false);

  async function switchActiveGateway(
    next: ActiveProvider,
    productionConfirmAcknowledged: boolean,
  ) {
    // Payments P5/P5a — both providers go through the same readiness API; the
    // server returns a 400 with the specific blocker when not ready, and
    // requires `productionConfirmAcknowledged: true` whenever the target
    // provider's environment is production.
    setSwitching(true);
    setSwitchError(null);
    try {
      const res = await fetch("/api/v1/admin/payments/active-gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: next,
          confirm: true,
          productionConfirmAcknowledged,
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Switch failed");
      setShowSwitchModal(false);
      setPendingProvider(null);
      setConfirmProdAck(false);
      await load();
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/v1/admin/launch-readiness", { cache: "no-store" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to load");
      setData(j.data);
      const lt = j.data?.lastTests;
      if (lt?.authNet?.timestamp) {
        setAuthNetTest({
          loading: false,
          ok: lt.authNet.ok,
          message: lt.authNet.message,
          timestamp: lt.authNet.timestamp,
        });
      }
      if (lt?.email?.timestamp) {
        setEmailTest({
          loading: false,
          ok: lt.email.ok,
          message: lt.email.message,
          timestamp: lt.email.timestamp,
        });
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function loadCybersource() {
    try {
      const res = await fetch("/api/v1/admin/payments/cybersource", { cache: "no-store" });
      const j = await res.json();
      if (!j.ok) return;
      const g = j.data.gateway;
      setCybersource({
        enabled: g.enabled,
        configured: g.configured,
        environment: g.environment,
        encryptionAvailable: j.data.encryptionAvailable,
        credentialStatus: {
          merchantId: g.credentialStatus.merchantId,
          keyId: g.credentialStatus.keyId,
          sharedSecret: g.credentialStatus.sharedSecret,
        },
        lastTest: g.lastTest
          ? { status: g.lastTest.status, timestamp: g.lastTest.timestamp }
          : null,
      });
    } catch {
      // non-fatal — Cybersource panel is optional
    }
  }
  useEffect(() => {
    load();
    loadCybersource();
  }, []);

  async function runEmailTest() {
    setEmailTest({ ...initTest, loading: true });
    const res = await fetch("/api/v1/admin/launch-readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send-test-email",
        ...(emailRecipient ? { to: emailRecipient } : {}),
      }),
    });
    const j = await res.json();
    setEmailTest({
      loading: false,
      ok: j.ok ?? false,
      message: j.data?.error ?? j.error ?? (j.ok ? "Sent" : null),
      timestamp: j.data?.timestamp ?? new Date().toISOString(),
    });
  }

  // Payments P4 — blockers are computed against the ACTIVE checkout gateway,
  // not "Authorize.net always". Receipts (Resend) blocker stays cross-cutting.
  const activeProviderLabel =
    data?.activeGateway?.activeLabel ?? "Authorize.net";
  const paymentBlockers = useMemo(() => {
    if (!data) return [] as string[];
    const b: string[] = [];
    const ag = data.activeGateway;
    if (ag) {
      // Use service-computed blockers for the active provider.
      for (const blocker of ag.blockers) b.push(blocker);
    } else {
      // Fallback for older payloads.
      if (!data.payments.apiLoginIdConfigured)
        b.push("AUTHORIZE_NET_API_LOGIN_ID missing");
      if (!data.payments.transactionKeyConfigured)
        b.push("AUTHORIZE_NET_TRANSACTION_KEY missing");
    }
    if (!data.email.resendApiKeyConfigured)
      b.push("RESEND_API_KEY missing (receipts will fail)");
    return b;
  }, [data]);

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Payments</h1>
        <p style={{ color: "#991b1b" }}>Error: {error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Payments</h1>
        <p>Loading…</p>
      </main>
    );
  }

  const authNetActive =
    data.payments.apiLoginIdConfigured && data.payments.transactionKeyConfigured;
  const providerStatus = !authNetActive
    ? "Misconfigured"
    : authNetTest.ok === false
    ? "Misconfigured"
    : "Active";

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Payments
          </h1>
          {data.activeGateway && (
            <span
              title="The provider that will handle the next checkout. Refund/void destinations are still routed by the original Payment.provider."
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: data.activeGateway.ready ? "#dcfce7" : "#fee2e2",
                color: data.activeGateway.ready ? "#166534" : "#991b1b",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Active checkout: {data.activeGateway.activeLabel}
              {data.activeGateway.activeEnvironment
                ? ` · ${data.activeGateway.activeEnvironment}`
                : ""}
              {!data.activeGateway.ready && " · not ready"}
            </span>
          )}
        </div>
        <p style={{ color: "#64748b", margin: "4px 0 0" }}>
          Gateway, refunds, receipts, tickets, and payment system checks.
        </p>
      </header>

      <nav
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          padding: 4,
          background: "#f1f5f9",
          borderRadius: 8,
          flexWrap: "wrap",
        }}
      >
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: section === s ? "#0f172a" : "transparent",
              color: section === s ? "#fff" : "#334155",
              fontWeight: section === s ? 600 : 500,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {s}
          </button>
        ))}
      </nav>

      {paymentBlockers.length > 0 && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <strong>
            Blockers for {activeProviderLabel} ({paymentBlockers.length}):
          </strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {paymentBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {section === "Overview" && (
        <>
          {data.activeGateway && (
            <Card title="Active checkout gateway">
              <Row label="Provider">
                <NeutralPill>
                  {data.activeGateway.activeLabel}
                  {data.activeGateway.activeEnvironment
                    ? ` · ${data.activeGateway.activeEnvironment}`
                    : ""}
                </NeutralPill>
              </Row>
              <Row label="Ready for checkout">
                <StatusPill
                  ok={data.activeGateway.ready}
                  label={data.activeGateway.ready ? "Yes" : "No"}
                />
              </Row>
              <Row label="Credential source">
                <NeutralPill>{data.activeGateway.source ?? "—"}</NeutralPill>
              </Row>
              {(() => {
                const inactiveKey: ActiveProvider =
                  data.activeGateway.active === "AUTHORIZE_NET"
                    ? "CYBERSOURCE"
                    : "AUTHORIZE_NET";
                const inactive = data.activeGateway.providers[inactiveKey];
                return (
                  <Row label={`${inactive.label} (inactive)`}>
                    <NeutralPill>
                      Inactive · not blocking Panama checkout
                    </NeutralPill>
                  </Row>
                );
              })()}
              {(() => {
                // Consumer contract: prefer payments.activeProviderBlockers
                // (the documented active-gateway-aware field on the readiness
                // payload). Fall back to activeGateway.blockers for safety.
                const banner =
                  data.payments.activeProviderBlockers ??
                  data.activeGateway.blockers;
                if (banner.length === 0) return null;
                return (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 8,
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      color: "#991b1b",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    {banner.map((b) => (
                      <div key={b}>• {b}</div>
                    ))}
                  </div>
                );
              })()}
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSwitchError(null);
                    setPendingProvider(data.activeGateway!.active);
                    setConfirmProdAck(false);
                    setShowSwitchModal(true);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #0f172a",
                    background: "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Change…
                </button>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  Refunds and voids continue to route by the original payment&apos;s provider.
                </span>
              </div>
            </Card>
          )}
          <Card title="Status at a glance">
            <Row label="Authorize.net provider">
              {providerStatus === "Active" ? (
                <StatusPill ok label="Active" />
              ) : (
                <StatusPill ok={false} label={providerStatus} />
              )}
            </Row>
            <Row label="Mode">
              {data.payments.isProduction ? (
                <WarnPill>production</WarnPill>
              ) : (
                <NeutralPill>sandbox</NeutralPill>
              )}
            </Row>
            <Row label="Cybersource provider">
              {!cybersource ? (
                <NeutralPill>Loading…</NeutralPill>
              ) : cybersource.enabled && cybersource.configured ? (
                <StatusPill ok label="Enabled" />
              ) : cybersource.configured ? (
                <NeutralPill>Configured</NeutralPill>
              ) : (
                <NeutralPill>Not configured</NeutralPill>
              )}
            </Row>
            <Row label="Cybersource mode">
              {!cybersource ? (
                <NeutralPill>—</NeutralPill>
              ) : cybersource.environment === "production" ? (
                <WarnPill>production</WarnPill>
              ) : (
                <NeutralPill>test</NeutralPill>
              )}
            </Row>
            <Row label="Cybersource last test">
              {!cybersource?.lastTest?.status ? (
                <NeutralPill>Never tested</NeutralPill>
              ) : cybersource.lastTest.status === "passed" ? (
                <StatusPill ok label="Passed" />
              ) : (
                <StatusPill ok={false} label="Failed" />
              )}
            </Row>
            <Row label="Receipts (Resend)">
              <StatusPill ok={data.email.resendApiKeyConfigured} />
            </Row>
            <Row label="Tickets reachable">
              <StatusPill
                ok={data.ticketing.ticketModelReachable}
                label={`${data.ticketing.ticketCount} tickets`}
              />
            </Row>
            <Row label="Gateway-first refunds/voids">
              <StatusPill ok={data.refunds?.gatewayFirstEnforced ?? true} label="Enforced" />
            </Row>
          </Card>
        </>
      )}

      {section === "Payment Providers" && (
        <>
          {data.activeGateway && (() => {
            const isAuthNetActive = data.activeGateway.active === "AUTHORIZE_NET";
            return (
              <Card title="Provider role for OKÜ Panama">
                <Row label="Authorize.net">
                  <NeutralPill>
                    {isAuthNetActive
                      ? "Used for OKÜ Panama checkout"
                      : "Available for future ReferrerOS markets · not blocking current checkout"}
                  </NeutralPill>
                </Row>
                <Row label="Cybersource">
                  <NeutralPill>
                    {!isAuthNetActive
                      ? "Used for OKÜ Panama checkout"
                      : "Available for future ReferrerOS markets · not blocking current checkout"}
                  </NeutralPill>
                </Row>
              </Card>
            );
          })()}
          <Card title="Authorize.net Credit Card">
            <Row label="Status">
              {providerStatus === "Active" ? (
                <StatusPill ok label="Active" />
              ) : (
                <StatusPill ok={false} label={providerStatus} />
              )}
            </Row>
            <Row label="Mode">
              {data.payments.isProduction ? (
                <WarnPill>production</WarnPill>
              ) : (
                <NeutralPill>sandbox</NeutralPill>
              )}
            </Row>
            <p style={{ color: "#64748b", fontSize: 13, margin: "12px 0 0" }}>
              Manage credentials and run a sandbox test on the{" "}
              <button
                type="button"
                onClick={() => setSection("Authorize.net")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1d4ed8",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                  font: "inherit",
                }}
              >
                Authorize.net
              </button>{" "}
              tab.
            </p>
          </Card>
          <Card title="Cybersource">
            <Row label="Status">
              {!cybersource ? (
                <NeutralPill>Loading…</NeutralPill>
              ) : cybersource.enabled && cybersource.configured ? (
                <StatusPill ok label="Enabled" />
              ) : cybersource.configured ? (
                <NeutralPill>Configured</NeutralPill>
              ) : (
                <NeutralPill>Not configured</NeutralPill>
              )}
            </Row>
            <Row label="Mode">
              {!cybersource ? (
                <NeutralPill>—</NeutralPill>
              ) : cybersource.environment === "production" ? (
                <WarnPill>production</WarnPill>
              ) : (
                <NeutralPill>test</NeutralPill>
              )}
            </Row>
            <Row label="Last test">
              {!cybersource?.lastTest?.status ? (
                <NeutralPill>Never tested</NeutralPill>
              ) : cybersource.lastTest.status === "passed" ? (
                <StatusPill ok label="Passed" />
              ) : (
                <StatusPill ok={false} label="Failed" />
              )}
            </Row>
            <p style={{ color: "#64748b", fontSize: 13, margin: "12px 0 0" }}>
              Accept card payments through Cybersource using REST API credentials. Manage
              credentials and run a sandbox test on the{" "}
              <button
                type="button"
                onClick={() => setSection("Cybersource")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1d4ed8",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                  font: "inherit",
                }}
              >
                Cybersource
              </button>{" "}
              tab. The active checkout gateway is controlled from the Overview tab; refunds and voids
              continue to route by the original payment&apos;s provider regardless of the active
              setting.
            </p>
          </Card>
        </>
      )}

      {section === "Authorize.net" && <AuthNetGatewayForm onChanged={load} />}

      {section === "Cybersource" && (
        <CybersourceGatewayForm
          onChanged={() => {
            load();
            loadCybersource();
          }}
        />
      )}

      {section === "Refunds & Voids" && (
        <RefundsVoidsPanel audits={data.recentPaymentAudits ?? []} />
      )}

      {section === "Receipts & Email" && (
        <Card title="Receipts & Email">
          <Row label="RESEND_API_KEY">
            <StatusPill ok={data.email.resendApiKeyConfigured} />
          </Row>
          <Row label="RESEND_FROM_EMAIL">
            <StatusPill ok={data.email.fromEmailConfigured} />
          </Row>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              type="email"
              placeholder="recipient@example.com (optional, defaults to your account email)"
              value={emailRecipient}
              onChange={(e) => setEmailRecipient(e.target.value)}
              style={{
                flex: "1 1 280px",
                padding: "8px 10px",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <button
              type="button"
              onClick={runEmailTest}
              disabled={emailTest.loading || !data.email.resendApiKeyConfigured}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#fff",
                cursor: emailTest.loading ? "wait" : "pointer",
                opacity: !data.email.resendApiKeyConfigured ? 0.5 : 1,
              }}
            >
              {emailTest.loading ? "Sending…" : "Send Test Email"}
            </button>
          </div>
          {emailTest.ok !== null && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <StatusPill ok={emailTest.ok} label={emailTest.ok ? "Sent" : "Failed"} />{" "}
              {emailTest.message && <span style={{ color: "#334155" }}>{emailTest.message}</span>}{" "}
              {emailTest.timestamp && (
                <span style={{ color: "#94a3b8" }}>· {emailTest.timestamp}</span>
              )}
            </div>
          )}
        </Card>
      )}

      {section === "Tickets & QR" && (
        <Card title="Tickets & QR">
          <Row label="Ticket model reachable">
            <StatusPill
              ok={data.ticketing.ticketModelReachable}
              label={`${data.ticketing.ticketCount} tickets`}
            />
          </Row>
          <Row label="Admin attendees / scanner page">
            <code style={{ color: "#475569", fontSize: 12 }}>
              {data.ticketingRoutes?.attendeesPage ?? "/admin/experiences/[id]/attendees"}
            </code>
          </Row>
          <Row label="Staff check-in page">
            <code style={{ color: "#475569", fontSize: 12 }}>
              {data.ticketingRoutes?.staffCheckInPage ?? "/staff/check-in"}
            </code>
          </Row>
          <Row label="Validate route">
            <code style={{ color: "#475569", fontSize: 12 }}>
              {data.ticketingRoutes?.validateRoute ?? "/api/v1/checkin/validate"}
            </code>
          </Row>
          <Row label="Manual check-in route">
            <code style={{ color: "#475569", fontSize: 12 }}>
              {data.ticketingRoutes?.manualCheckInRoute ?? "/api/v1/checkin/manual"}
            </code>
          </Row>
          <Row label="Host scan route">
            <code style={{ color: "#475569", fontSize: 12 }}>
              {data.ticketingRoutes?.hostScanRoute ?? "/api/v1/host/scan"}
            </code>
          </Row>
          <Row label="Resend confirmation route">
            <code style={{ color: "#475569", fontSize: 12 }}>
              {data.ticketingRoutes?.resendConfirmationRoute ??
                "/api/v1/admin/orders/{id}/resend-confirmation"}
            </code>
          </Row>
          <Row label="RFID">
            <NeutralPill>{data.ticketing.rfid.note}</NeutralPill>
          </Row>
        </Card>
      )}

      {section === "System Checks" && (
        <>
          {cybersource && (
            <Card title="Cybersource">
              <Row label="Available for checkout">
                {(() => {
                  // Mirror the activation guard: a provider is "available for
                  // checkout" only when the same per-provider readiness used
                  // by setActiveCheckoutGateway() considers it selectable
                  // (configured + enabled + decryptable + recent passing test).
                  const ready =
                    data.activeGateway?.providers.CYBERSOURCE.selectable ??
                    (cybersource.enabled && cybersource.configured);
                  return ready ? (
                    <StatusPill ok label="Yes" />
                  ) : (
                    <NeutralPill>No — see blockers above</NeutralPill>
                  );
                })()}
              </Row>
              <Row label="APP_ENCRYPTION_KEY">
                {cybersource.encryptionAvailable ? (
                  <StatusPill ok label="Available" />
                ) : (
                  <WarnPill>Missing — credential editing unavailable</WarnPill>
                )}
              </Row>
              <Row label="Merchant ID">
                {cybersource.credentialStatus.merchantId === "saved" ? (
                  <StatusPill ok label="Saved" />
                ) : cybersource.enabled ? (
                  <StatusPill ok={false} label="Missing — required" />
                ) : (
                  <NeutralPill>Missing</NeutralPill>
                )}
              </Row>
              <Row label="Key ID">
                {cybersource.credentialStatus.keyId === "saved" ? (
                  <StatusPill ok label="Saved" />
                ) : cybersource.enabled ? (
                  <StatusPill ok={false} label="Missing — required" />
                ) : (
                  <NeutralPill>Missing</NeutralPill>
                )}
              </Row>
              <Row label="Shared Secret">
                {cybersource.credentialStatus.sharedSecret === "saved" ? (
                  <StatusPill ok label="Saved" />
                ) : cybersource.enabled ? (
                  <StatusPill ok={false} label="Missing — required" />
                ) : (
                  <NeutralPill>Missing</NeutralPill>
                )}
              </Row>
            </Card>
          )}
          <Card title="Auth & URLs">
            <Row label="NEXTAUTH_SECRET">
              <StatusPill ok={data.auth.nextAuthSecretConfigured} />
            </Row>
            <Row label="NEXTAUTH_URL">
              <StatusPill ok={data.auth.nextAuthUrlConfigured} />
            </Row>
            <Row label="NEXT_PUBLIC_APP_URL">
              <StatusPill ok={data.auth.publicAppUrlConfigured} />
            </Row>
          </Card>
          <Card title="Runtime & Flags">
            <Row label="DATABASE_URL">
              <StatusPill ok={data.runtime.databaseUrlConfigured} />
            </Row>
            <Row label="REDIS_URL">
              {data.runtime.redisConfigured ? (
                <StatusPill ok />
              ) : (
                <WarnPill>Not configured (using inline fallback — non-blocking)</WarnPill>
              )}
            </Row>
            <Row label="NODE_ENV">
              <code style={{ color: "#475569", fontSize: 12 }}>{data.runtime.nodeEnv}</code>
            </Row>
            <Row label="DEMO_MODE_ENABLED">
              {data.flags.demoModeEnabled ? (
                <WarnPill>true — disable for production</WarnPill>
              ) : (
                <StatusPill ok label="false" />
              )}
            </Row>
          </Card>
          <Card title="Sandbox test plan">
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                color: "#334155",
                lineHeight: 1.8,
                fontSize: 13,
              }}
            >
              <li>
                Checkout success — sandbox card 4111 1111 1111 1111 → Order PAID, Payment SUCCEEDED,
                authNetTransId set, tickets issued, confirmation email sent.
              </li>
              <li>
                Checkout decline — sandbox decline card → Order not PAID, no tickets, capacity
                released.
              </li>
              <li>
                Refund success — Admin → Orders → full refund → Order REFUNDED, Payment REFUNDED,
                capacity released, commission reversed, OrderEvent ORDER_REFUNDED, AuditLog with
                gateway txid.
              </li>
              <li>
                Failed refund protection — refund without authNetTransId → rejected; Order/Payment
                unchanged; AuditLog records failure.
              </li>
              <li>
                Partial refund — partial amount → gateway succeeds, Order = PARTIALLY_REFUNDED,
                Payment stays SUCCEEDED, AuditLog records amount.
              </li>
              <li>
                Void / cancel paid order — gateway void must succeed before DB mutation; success →
                Order CANCELLED, Payment VOIDED, AuditLog with void txid; failure → both unchanged.
              </li>
              <li>
                Confirmation email — paid sandbox order → email sent via Resend from verified
                sender.
              </li>
              <li>
                Ticket QR scan — open the current attendee/check-in scanner route (e.g.{" "}
                <code>/admin/experiences/[id]/attendees</code> or <code>/staff/check-in</code>),
                scan a ticket QR; status flips to CHECKED_IN exactly once.
              </li>
              <li>
                Resend confirmation — POST{" "}
                <code>/api/v1/admin/orders/{`{id}`}/resend-confirmation</code>; verify a fresh
                email lands.
              </li>
            </ul>
          </Card>
        </>
      )}

      {section === "Audit Trail" && (
        <Card title="Recent payment & gateway activity">
          {(!data.recentPaymentAudits || data.recentPaymentAudits.length === 0) && (
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>No recent activity.</p>
          )}
          {data.recentPaymentAudits && data.recentPaymentAudits.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#475569" }}>
                    <th style={{ padding: "8px 6px" }}>When</th>
                    <th style={{ padding: "8px 6px" }}>Action</th>
                    <th style={{ padding: "8px 6px" }}>Actor</th>
                    <th style={{ padding: "8px 6px" }}>Order</th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>Amount</th>
                    <th style={{ padding: "8px 6px" }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPaymentAudits.map((a) => {
                    const al = actionLabel(a.action);
                    const actorText = a.actor
                      ? a.actor.name || a.actor.email || a.actor.id
                      : "—";
                    let detail: React.ReactNode = a.gatewayMessage ?? "—";
                    if (a.activeGatewayChange) {
                      const c = a.activeGatewayChange;
                      const arrow = `${gatewayLabelShort(c.before)} → ${gatewayLabelShort(c.after)}`;
                      if (a.action === "payment.gateway.active.changed.rejected") {
                        detail = (
                          <span>
                            <strong>{arrow} attempted</strong>
                            {c.reason ? ` — rejected: ${c.reason}` : " — rejected"}
                          </span>
                        );
                      } else {
                        detail = <strong>{arrow}</strong>;
                      }
                    }
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 6px", color: "#334155" }}>{a.createdAt}</td>
                        <td style={{ padding: "8px 6px" }}>
                          <StatusPill ok={al.ok} label={al.label} />
                        </td>
                        <td style={{ padding: "8px 6px", color: "#475569" }}>
                          {actorText}
                        </td>
                        <td style={{ padding: "8px 6px", color: "#475569" }}>
                          <code style={{ fontSize: 12 }}>{a.orderId ?? "—"}</code>
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right", color: "#334155" }}>
                          {a.amountCents != null ? `$${(a.amountCents / 100).toFixed(2)}` : "—"}
                        </td>
                        <td style={{ padding: "8px 6px", color: "#475569" }}>
                          {detail}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {showSwitchModal && data.activeGateway && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Change active checkout gateway"
          onClick={() => {
            if (switching) return;
            setShowSwitchModal(false);
            setConfirmProdAck(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 20,
              width: 460,
              maxWidth: "90vw",
              boxShadow: "0 18px 40px rgba(15,23,42,0.25)",
            }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
              Change active checkout gateway
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#475569" }}>
              The active gateway processes the next checkout. Refunds and voids on
              existing orders continue to route by their original{" "}
              <code>Payment.provider</code>.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(["AUTHORIZE_NET", "CYBERSOURCE"] as const).map((p) => {
                const r = data.activeGateway!.providers[p];
                const isCurrent = data.activeGateway!.active === p;
                const disabled = !r.selectable;
                return (
                  <label
                    key={p}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: 10,
                      border:
                        pendingProvider === p
                          ? "2px solid #0f172a"
                          : "1px solid #e2e8f0",
                      borderRadius: 8,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.65 : 1,
                      background: isCurrent ? "#f8fafc" : "#fff",
                    }}
                  >
                    <input
                      type="radio"
                      name="active-gateway"
                      value={p}
                      checked={pendingProvider === p}
                      disabled={disabled}
                      onChange={() => setPendingProvider(p)}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <strong style={{ fontSize: 14, color: "#0f172a" }}>
                          {r.label}
                        </strong>
                        {isCurrent && <NeutralPill>Current</NeutralPill>}
                        {disabled && <WarnPill>Locked</WarnPill>}
                        {r.configured ? (
                          <StatusPill ok label="Configured" />
                        ) : (
                          <NeutralPill>Not configured</NeutralPill>
                        )}
                      </div>
                      {r.lockedReason && (
                        <div style={{ fontSize: 12, color: "#92400e", marginTop: 4 }}>
                          {r.lockedReason}
                        </div>
                      )}
                      {!disabled && r.blockers.length > 0 && (
                        <div style={{ fontSize: 12, color: "#991b1b", marginTop: 4 }}>
                          {r.blockers.join("; ")}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            {(() => {
              if (!pendingProvider) return null;
              const target = data.activeGateway!.providers[pendingProvider];
              if (target.environment !== "production") return null;
              return (
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    marginTop: 14,
                    padding: 10,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    borderRadius: 6,
                    fontSize: 13,
                    color: "#7f1d1d",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={confirmProdAck}
                    onChange={(e) => setConfirmProdAck(e.target.checked)}
                    disabled={switching}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    I understand this will route live checkout payments through{" "}
                    {target.label} production.
                  </span>
                </label>
              );
            })()}
            {switchError && (
              <div
                style={{
                  marginTop: 12,
                  padding: 8,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {switchError}
              </div>
            )}
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowSwitchModal(false);
                  setConfirmProdAck(false);
                }}
                disabled={switching}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#0f172a",
                  cursor: switching ? "wait" : "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              {(() => {
                const target = pendingProvider
                  ? data.activeGateway!.providers[pendingProvider]
                  : null;
                const isProdTarget = target?.environment === "production";
                const baseDisabled =
                  switching ||
                  !pendingProvider ||
                  pendingProvider === data.activeGateway!.active ||
                  !target?.selectable;
                const prodCheckRequired = isProdTarget && !confirmProdAck;
                const disabled = baseDisabled || prodCheckRequired;
                return (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      pendingProvider &&
                      switchActiveGateway(pendingProvider, confirmProdAck)
                    }
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid #0f172a",
                      background: "#0f172a",
                      color: "#fff",
                      cursor: switching ? "wait" : "pointer",
                      fontSize: 13,
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    {switching ? "Activating…" : "Activate"}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
