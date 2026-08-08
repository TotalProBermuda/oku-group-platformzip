"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./commerce-settings.css";

type StoreStatus = "OPEN" | "CLOSED" | "TEST_MODE";
type DebugMode = "OFF" | "ERRORS_ONLY" | "VERBOSE";

interface Settings {
  businessName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  countryRegion: string | null;
  currency: string;
  timezone: string;
  storeStatus: StoreStatus;
  capacityManagementEnabled: boolean;
  holdMinutes: number;
  lowStockThreshold: number;
  soldOutThreshold: number;
  stockNotificationEmails: string[];
  hideSoldOutTicketTypes: boolean;
  allowGuestCheckout: boolean;
  requireAccountForMemberships: boolean;
  continueShoppingDestination: string;
  emptyCartText: string | null;
  checkoutSupportEmail: string | null;
  cancellationPolicyText: string | null;
  senderName: string | null;
  adminNotificationEmails: string[];
  debugMode: DebugMode;
}

interface ReadinessSnapshot {
  payments: {
    apiLoginIdConfigured: boolean;
    transactionKeyConfigured: boolean;
    mode: string;
    providers?: {
      cybersource?: {
        configured: boolean;
        environment: string | null;
        selectable: boolean;
        blockers: string[];
      } | null;
    } | null;
  };
  activeGateway?: { active?: string | null } | null;
  email: { resendApiKeyConfigured: boolean; fromEmailConfigured: boolean };
  runtime: { redisConfigured: boolean };
  flags: { demoModeEnabled: boolean };
}

const TABS = [
  { key: "general", label: "General", helper: "Business identity and operating status" },
  { key: "inventory", label: "Inventory", helper: "Ticket holds, capacity, and sold-out rules" },
  { key: "checkout", label: "Checkout", helper: "Guest flow and cancellation messaging" },
  { key: "emails", label: "Emails", helper: "Sender and admin notification defaults" },
  { key: "integrations", label: "Integrations", helper: "Payment, email, POS, and worker health" },
  { key: "advanced", label: "Advanced", helper: "Debugging, demo mode, and audit posture" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const CONTINUE_OPTIONS = [
  { value: "/series", label: "/series — Experiences" },
  { value: "/restaurants", label: "/restaurants — Venues" },
  { value: "/membership", label: "/membership — Membership" },
  { value: "custom", label: "Custom URL…" },
] as const;

function Badge({
  variant,
  children,
}: {
  variant: "ok" | "warning" | "error" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    variant === "ok"
      ? "commerce-settings__badge commerce-settings__badge-ok"
      : variant === "warning"
      ? "commerce-settings__badge commerce-settings__badge-warning"
      : variant === "error"
      ? "commerce-settings__badge commerce-settings__badge-error"
      : "commerce-settings__badge commerce-settings__badge-neutral";
  return <span className={cls}>{children}</span>;
}

function SettingRow({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="commerce-settings__row">
      <div className="commerce-settings__row-copy">
        <label>{label}</label>
        {helper && <p>{helper}</p>}
      </div>
      <div className="commerce-settings__control">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-checked={checked}
      role="switch"
      className="commerce-settings__toggle"
      onClick={() => onChange(!checked)}
    />
  );
}

function EmailListEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const list = value.length === 0 ? [""] : value;
  return (
    <div className="commerce-settings__email-list">
      {list.map((email, i) => (
        <div key={i} className="commerce-settings__email-list-row">
          <input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              const next = [...list];
              next[i] = e.target.value;
              onChange(next.filter((s) => s.trim().length > 0));
            }}
          />
          <button
            type="button"
            className="commerce-settings__btn"
            onClick={() => onChange(list.filter((_, j) => j !== i).filter((s) => s.trim().length > 0))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="commerce-settings__btn"
        onClick={() => onChange([...value, ""])}
        style={{ alignSelf: "flex-start" }}
      >
        + Add email
      </button>
    </div>
  );
}

export default function CommerceSettingsPanel() {
  const [tab, setTab] = useState<TabKey>("general");
  const [original, setOriginal] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [readiness, setReadiness] = useState<ReadinessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, error?: boolean) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, error });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch("/api/v1/admin/commerce/settings", { cache: "no-store" }),
        fetch("/api/v1/admin/launch-readiness", { cache: "no-store" }).catch(() => null),
      ]);
      const sJson = await sRes.json();
      if (!sJson.ok) throw new Error(sJson.error || "Failed to load settings");
      const settings: Settings = sJson.data;
      setOriginal(settings);
      setDraft(settings);
      if (rRes && rRes.ok) {
        const rJson = await rRes.json();
        if (rJson.ok) setReadiness(rJson.data);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const dirty = useMemo(() => {
    if (!original || !draft) return false;
    return JSON.stringify(original) !== JSON.stringify(draft);
  }, [original, draft]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!draft || !original) return;
    setSaving(true);
    try {
      const patch: Partial<Settings> = {};
      (Object.keys(draft) as (keyof Settings)[]).forEach((k) => {
        if (JSON.stringify(draft[k]) !== JSON.stringify(original[k])) {
          (patch as any)[k] = draft[k];
        }
      });
      const res = await fetch("/api/v1/admin/commerce/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      setOriginal(j.data);
      setDraft(j.data);
      showToast("Commerce settings saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (original) setDraft(original);
  }

  if (error) {
    return (
      <main className="commerce-settings">
        <header className="commerce-settings__header">
          <h1>Commerce Settings</h1>
          <p style={{ color: "var(--color-danger)" }}>{error}</p>
        </header>
      </main>
    );
  }
  if (loading || !draft) {
    return (
      <main className="commerce-settings">
        <header className="commerce-settings__header">
          <h1>Commerce Settings</h1>
          <p>Loading…</p>
        </header>
      </main>
    );
  }

  const senderEmailEnv =
    typeof readiness?.email.fromEmailConfigured === "boolean" ? readiness.email.fromEmailConfigured : false;
  const continueIsCustom = !CONTINUE_OPTIONS.some(
    (o) => o.value === draft.continueShoppingDestination && o.value !== "custom"
  );

  return (
    <main className="commerce-settings">
      <header className="commerce-settings__header">
        <h1>Commerce Settings</h1>
        <p>
          Store identity, ticket inventory, checkout behavior, email defaults, and integration
          health.
        </p>
      </header>

      <div className="commerce-settings__status-strip">
        <Badge
          variant={
            draft.storeStatus === "OPEN"
              ? "ok"
              : draft.storeStatus === "TEST_MODE"
              ? "warning"
              : "error"
          }
        >
          Store:{" "}
          {draft.storeStatus === "OPEN"
            ? "Open"
            : draft.storeStatus === "TEST_MODE"
            ? "Test Mode"
            : "Closed"}
        </Badge>
        <Badge variant={draft.allowGuestCheckout ? "ok" : "neutral"}>
          Checkout: {draft.allowGuestCheckout ? "Guest enabled" : "Account required"}
        </Badge>
        <Badge variant={draft.capacityManagementEnabled ? "ok" : "neutral"}>
          Inventory: {draft.capacityManagementEnabled ? "Capacity managed" : "Manual"}
        </Badge>
        <Badge
          variant={
            readiness?.email.resendApiKeyConfigured && draft.senderName
              ? "ok"
              : readiness?.email.resendApiKeyConfigured
              ? "warning"
              : "error"
          }
        >
          Email:{" "}
          {!readiness?.email.resendApiKeyConfigured
            ? "Resend missing"
            : draft.senderName
            ? "Configured"
            : "Missing sender"}
        </Badge>
      </div>

      <div className="commerce-settings__layout">
        <nav className="commerce-settings__tabs" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`commerce-settings__tab${
                tab === t.key ? " commerce-settings__tab-active" : ""
              }`}
              onClick={() => setTab(t.key)}
            >
              <span className="commerce-settings__tab-label">{t.label}</span>
              <span className="commerce-settings__tab-helper">{t.helper}</span>
            </button>
          ))}
        </nav>

        <section className="commerce-settings__panel">
          {tab === "general" && (
            <>
              <div className="commerce-settings__section-header">
                <h2>General</h2>
                <p>Business identity and operating status shown across receipts and emails.</p>
              </div>
              <SettingRow label="Business name" helper="Used on receipts and confirmation emails.">
                <input
                  type="text"
                  value={draft.businessName ?? ""}
                  onChange={(e) => update("businessName", e.target.value || null)}
                  placeholder="OKÜ Hospitality Group"
                />
              </SettingRow>
              <SettingRow label="Address line 1">
                <input
                  type="text"
                  value={draft.addressLine1 ?? ""}
                  onChange={(e) => update("addressLine1", e.target.value || null)}
                />
              </SettingRow>
              <SettingRow label="Address line 2">
                <input
                  type="text"
                  value={draft.addressLine2 ?? ""}
                  onChange={(e) => update("addressLine2", e.target.value || null)}
                />
              </SettingRow>
              <SettingRow label="City">
                <input
                  type="text"
                  value={draft.city ?? ""}
                  onChange={(e) => update("city", e.target.value || null)}
                />
              </SettingRow>
              <SettingRow label="Country / region">
                <input
                  type="text"
                  value={draft.countryRegion ?? ""}
                  onChange={(e) => update("countryRegion", e.target.value || null)}
                  placeholder="Panama"
                />
              </SettingRow>
              <SettingRow label="Currency" helper="ISO 4217 code (e.g. USD, EUR, PAB).">
                <select
                  value={draft.currency}
                  onChange={(e) => update("currency", e.target.value)}
                >
                  {["USD", "EUR", "PAB", "MXN", "BRL", "GBP"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Timezone" helper="Used for session start times and reporting.">
                <select
                  value={draft.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                >
                  {[
                    "America/Panama",
                    "America/New_York",
                    "America/Mexico_City",
                    "America/Sao_Paulo",
                    "Europe/Madrid",
                    "Europe/London",
                    "UTC",
                  ].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                label="Store status"
                helper="Controls whether new orders may be placed."
              >
                <div className="commerce-settings__segmented">
                  {(["OPEN", "CLOSED", "TEST_MODE"] as StoreStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={draft.storeStatus === s}
                      onClick={() => update("storeStatus", s)}
                    >
                      {s === "OPEN" ? "Open" : s === "CLOSED" ? "Closed" : "Test Mode"}
                    </button>
                  ))}
                </div>
                {draft.storeStatus === "CLOSED" && (
                  <div className="commerce-settings__warning-note">
                    Guests may not be able to complete checkout while the store is closed.
                  </div>
                )}
              </SettingRow>
            </>
          )}

          {tab === "inventory" && (
            <>
              <div className="commerce-settings__section-header">
                <h2>Inventory</h2>
                <p>How tickets are held during checkout and when the team is alerted.</p>
              </div>
              <SettingRow
                label="Capacity management"
                helper="Track available seats per session and prevent oversell."
              >
                <Toggle
                  ariaLabel="Capacity management"
                  checked={draft.capacityManagementEnabled}
                  onChange={(v) => update("capacityManagementEnabled", v)}
                />
              </SettingRow>
              <SettingRow
                label="Hold minutes"
                helper="Hold tickets temporarily while a guest completes checkout."
              >
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={draft.holdMinutes}
                  onChange={(e) => update("holdMinutes", Math.max(0, Number(e.target.value) || 0))}
                />
              </SettingRow>
              <SettingRow
                label="Low-stock threshold"
                helper="Notify the team before a session sells out."
              >
                <input
                  type="number"
                  min={0}
                  value={draft.lowStockThreshold}
                  onChange={(e) =>
                    update("lowStockThreshold", Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </SettingRow>
              <SettingRow
                label="Sold-out threshold"
                helper="Number of seats remaining at which a session is treated as sold out."
              >
                <input
                  type="number"
                  min={0}
                  value={draft.soldOutThreshold}
                  onChange={(e) =>
                    update("soldOutThreshold", Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </SettingRow>
              <SettingRow
                label="Stock notification recipients"
                helper="Operators who receive low-stock and sold-out alerts."
              >
                <EmailListEditor
                  value={draft.stockNotificationEmails}
                  onChange={(v) => update("stockNotificationEmails", v)}
                />
              </SettingRow>
              <SettingRow
                label="Hide sold-out ticket types"
                helper="Remove sold-out tiers from public ticket pickers."
              >
                <Toggle
                  ariaLabel="Hide sold-out ticket types"
                  checked={draft.hideSoldOutTicketTypes}
                  onChange={(v) => update("hideSoldOutTicketTypes", v)}
                />
              </SettingRow>
              <div className="commerce-settings__preview-summary">
                Tickets will be held for <strong>{draft.holdMinutes}</strong> minutes. Low stock
                begins at <strong>{draft.lowStockThreshold}</strong>. Sold out begins at{" "}
                <strong>{draft.soldOutThreshold}</strong>.
              </div>
            </>
          )}

          {tab === "checkout" && (
            <>
              <div className="commerce-settings__section-header">
                <h2>Checkout</h2>
                <p>Guest flow, return-to-browsing destination, and policy messaging.</p>
              </div>
              <SettingRow
                label="Allow guest checkout"
                helper="Guests can reserve and pay without creating an account."
              >
                <Toggle
                  ariaLabel="Allow guest checkout"
                  checked={draft.allowGuestCheckout}
                  onChange={(v) => update("allowGuestCheckout", v)}
                />
              </SettingRow>
              <SettingRow
                label="Require account for memberships"
                helper="Memberships always require a registered guest profile."
              >
                <Toggle
                  ariaLabel="Require account for memberships"
                  checked={draft.requireAccountForMemberships}
                  onChange={(v) => update("requireAccountForMemberships", v)}
                />
              </SettingRow>
              <SettingRow
                label="Continue browsing destination"
                helper="Where guests are sent after viewing an empty cart."
              >
                <select
                  value={
                    CONTINUE_OPTIONS.some(
                      (o) => o.value === draft.continueShoppingDestination && o.value !== "custom"
                    )
                      ? draft.continueShoppingDestination
                      : "custom"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    update("continueShoppingDestination", v === "custom" ? "" : v);
                  }}
                >
                  {CONTINUE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {continueIsCustom && (
                  <input
                    type="url"
                    placeholder="https://oku.group/explore"
                    value={draft.continueShoppingDestination}
                    onChange={(e) => update("continueShoppingDestination", e.target.value)}
                  />
                )}
              </SettingRow>
              <SettingRow
                label="Empty cart message"
                helper="Hospitality-forward copy shown to guests with no items."
              >
                <textarea
                  value={draft.emptyCartText ?? ""}
                  onChange={(e) => update("emptyCartText", e.target.value || null)}
                  placeholder="Your basket is empty. Discover an upcoming experience or table to begin."
                />
              </SettingRow>
              <SettingRow
                label="Checkout support email"
                helper="Shown to guests who need help completing a reservation."
              >
                <input
                  type="email"
                  placeholder="hospitality@oku.group"
                  value={draft.checkoutSupportEmail ?? ""}
                  onChange={(e) => update("checkoutSupportEmail", e.target.value || null)}
                />
              </SettingRow>
              <SettingRow
                label="Cancellation policy"
                helper="Shown at checkout and on confirmation emails."
              >
                <textarea
                  value={draft.cancellationPolicyText ?? ""}
                  onChange={(e) => update("cancellationPolicyText", e.target.value || null)}
                  placeholder="Reservations may be modified or cancelled up to 48 hours in advance…"
                />
              </SettingRow>
            </>
          )}

          {tab === "emails" && (
            <>
              <div className="commerce-settings__section-header">
                <h2>Emails</h2>
                <p>Sender identity and operator notification recipients. Secrets are managed in environment variables.</p>
              </div>
              <div style={{ padding: "12px 20px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {readiness?.email.resendApiKeyConfigured ? (
                  <Badge variant="ok">Resend configured</Badge>
                ) : (
                  <Badge variant="error">Resend not configured</Badge>
                )}
                <Badge variant={senderEmailEnv ? "ok" : "warning"}>
                  Sender domain: {senderEmailEnv ? "Configured" : "Default sandbox sender"}
                </Badge>
              </div>
              <SettingRow
                label="Sender display name"
                helper="Appears as the From name in guest-facing emails."
              >
                <input
                  type="text"
                  value={draft.senderName ?? ""}
                  onChange={(e) => update("senderName", e.target.value || null)}
                  placeholder="OKÜ Hospitality"
                />
              </SettingRow>
              <SettingRow
                label="Admin notification recipients"
                helper="Operators who receive new-order and refund alerts."
              >
                <EmailListEditor
                  value={draft.adminNotificationEmails}
                  onChange={(v) => update("adminNotificationEmails", v)}
                />
              </SettingRow>
              <SettingRow
                label="Send test email"
                helper="Test delivery from the Payments operations area to avoid duplicating credentials here."
              >
                <a
                  href="/admin/payments"
                  className="commerce-settings__btn"
                  style={{ display: "inline-block", textDecoration: "none" }}
                >
                  Test from Payments →
                </a>
              </SettingRow>
            </>
          )}

          {tab === "integrations" && (
            <>
              <div className="commerce-settings__section-header">
                <h2>Integrations</h2>
                <p>Read-only operational health for external systems. Manage secrets in environment variables.</p>
              </div>
              {(() => {
                const cs = readiness?.payments.providers?.cybersource ?? null;
                const active = readiness?.activeGateway?.active ?? null;
                const isActive = active === "CYBERSOURCE";
                let badge: React.ReactNode;
                if (!cs) {
                  badge = <Badge variant="neutral">Status unavailable</Badge>;
                } else if (!cs.configured) {
                  badge = <Badge variant="error">Misconfigured</Badge>;
                } else if (cs.blockers.length > 0) {
                  badge = <Badge variant="warning">Not ready</Badge>;
                } else {
                  badge = <Badge variant="ok">{cs.environment ?? "configured"}</Badge>;
                }
                return (
                  <div className="commerce-settings__integration-row">
                    <span className="commerce-settings__integration-name">
                      Cybersource{isActive ? " · active checkout" : ""}
                    </span>
                    <span className="commerce-settings__integration-purpose">
                      Primary card processor for OKÜ Panama
                    </span>
                    {badge}
                    <span className="commerce-settings__integration-action">
                      <a href="/admin/payments?tab=cybersource">Manage →</a>
                    </span>
                  </div>
                );
              })()}
              <div className="commerce-settings__integration-row">
                <span className="commerce-settings__integration-name">
                  Authorize.net
                  {readiness?.activeGateway?.active === "AUTHORIZE_NET" ? " · active checkout" : ""}
                </span>
                <span className="commerce-settings__integration-purpose">
                  Inactive — retained for ReferrerOS rollout, not used for current checkout
                </span>
                {readiness?.payments.apiLoginIdConfigured && readiness?.payments.transactionKeyConfigured ? (
                  <Badge variant="neutral">{readiness.payments.mode} · standby</Badge>
                ) : (
                  <Badge variant="neutral">Not configured · standby</Badge>
                )}
                <span className="commerce-settings__integration-action">
                  <a href="/admin/payments?tab=authnet">Manage →</a>
                </span>
              </div>
              <div className="commerce-settings__integration-row">
                <span className="commerce-settings__integration-name">Resend</span>
                <span className="commerce-settings__integration-purpose">
                  Transactional email delivery
                </span>
                {readiness?.email.resendApiKeyConfigured ? (
                  <Badge variant="ok">Configured</Badge>
                ) : (
                  <Badge variant="error">Missing</Badge>
                )}
                <span className="commerce-settings__integration-action">
                  <a href="/admin/payments">Manage →</a>
                </span>
              </div>
              <div className="commerce-settings__integration-row">
                <span className="commerce-settings__integration-name">INVU POS</span>
                <span className="commerce-settings__integration-purpose">
                  Restaurant POS attribution and revenue capture
                </span>
                <Badge variant="neutral">See integration</Badge>
                <span className="commerce-settings__integration-action">
                  <a href="/admin/integrations/invu">Manage →</a>
                </span>
              </div>
              <div className="commerce-settings__integration-row">
                <span className="commerce-settings__integration-name">Redis / Worker</span>
                <span className="commerce-settings__integration-purpose">
                  Background jobs and shared rate limiting
                </span>
                {readiness?.runtime.redisConfigured ? (
                  <Badge variant="ok">Configured</Badge>
                ) : (
                  <Badge variant="warning">Inline fallback</Badge>
                )}
                <span className="commerce-settings__integration-action">
                  <a href="/admin/payments">Status →</a>
                </span>
              </div>
            </>
          )}

          {tab === "advanced" && (
            <>
              <div className="commerce-settings__section-header">
                <h2>Advanced</h2>
                <p>Debug posture and audit-mode visibility. Treat with care in production.</p>
              </div>
              <SettingRow
                label="Debug logging"
                helper="Verbose mode must never expose card data, secrets, or guest payment details."
              >
                <select
                  value={draft.debugMode}
                  onChange={(e) => update("debugMode", e.target.value as DebugMode)}
                >
                  <option value="OFF">Off</option>
                  <option value="ERRORS_ONLY">Errors only</option>
                  <option value="VERBOSE">Verbose</option>
                </select>
                {draft.debugMode === "VERBOSE" && (
                  <div className="commerce-settings__warning-note">
                    Verbose logs must never expose card data, secrets, or guest payment details.
                  </div>
                )}
              </SettingRow>
              <SettingRow
                label="Demo mode"
                helper="Enabled in non-production environments via DEMO_MODE_ENABLED."
              >
                {readiness?.flags.demoModeEnabled ? (
                  <Badge variant="warning">Enabled — must be off in production</Badge>
                ) : (
                  <Badge variant="ok">Disabled</Badge>
                )}
              </SettingRow>
              <SettingRow
                label="Webhook delivery"
                helper="Outbound webhooks are not yet configured."
              >
                <Badge variant="neutral">Not configured</Badge>
              </SettingRow>
              <SettingRow
                label="Audit logging"
                helper="Every settings change is recorded with before/after values in AuditLog."
              >
                <Badge variant="ok">Enabled</Badge>
              </SettingRow>
            </>
          )}

          {dirty && (
            <div className="commerce-settings__savebar">
              <span className="commerce-settings__savebar-text">Unsaved changes</span>
              <span style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="commerce-settings__btn"
                  onClick={reset}
                  disabled={saving}
                >
                  Reset changes
                </button>
                <button
                  type="button"
                  className="commerce-settings__btn commerce-settings__btn-primary"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </span>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div
          className={`commerce-settings__toast${
            toast.error ? " commerce-settings__toast-error" : ""
          }`}
          role="status"
        >
          {toast.msg}
        </div>
      )}
    </main>
  );
}
