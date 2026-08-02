"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface SafeView {
  provider: string;
  label: string;
  isActive: boolean;
  environment: "sandbox" | "production";
  connectionType: "gateway_only" | "all_in_one";
  enableGateway: boolean;
  hasApiLoginId: boolean;
  hasTransactionKey: boolean;
  hasSignatureKey: boolean;
  apiLoginIdLast4: string | null;
  transactionKeyLast4: string | null;
  signatureKeyLast4: string | null;
  merchantProviderName: string | null;
  merchantIdLast4: string | null;
  terminalIdLast4: string | null;
  checkoutTitle: string;
  checkoutDescription: string;
  displayCsc: boolean;
  transactionType: "charge" | "authorize_only";
  detailedDeclines: boolean;
  debugMode: "off" | "errors" | "verbose";
  acceptedCardLogos: string[];
  updatedAt: string | null;
}

interface GatewaysApi {
  encryptionAvailable: boolean;
  envFallback: {
    apiLoginIdConfigured: boolean;
    transactionKeyConfigured: boolean;
    envConfigured: boolean;
  };
  gateways: SafeView[];
}

const CARD_OPTIONS = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "MasterCard" },
  { value: "amex", label: "American Express" },
  { value: "discover", label: "Discover" },
  { value: "diners", label: "Diners" },
  { value: "jcb", label: "JCB" },
];

type FormState = {
  enableGateway: boolean;
  environment: "sandbox" | "production";
  connectionType: "gateway_only" | "all_in_one";
  checkoutTitle: string;
  checkoutDescription: string;
  apiLoginIdInput: string;
  transactionKeyInput: string;
  signatureKeyInput: string;
  merchantProviderName: string;
  merchantIdInput: string;
  terminalIdInput: string;
  displayCsc: boolean;
  transactionType: "charge" | "authorize_only";
  detailedDeclines: boolean;
  debugMode: "off" | "errors" | "verbose";
  acceptedCardLogos: string[];
};

function fromView(v: SafeView): FormState {
  return {
    enableGateway: v.enableGateway,
    environment: v.environment,
    connectionType: v.connectionType,
    checkoutTitle: v.checkoutTitle,
    checkoutDescription: v.checkoutDescription,
    apiLoginIdInput: "",
    transactionKeyInput: "",
    signatureKeyInput: "",
    merchantProviderName: v.merchantProviderName ?? "",
    merchantIdInput: "",
    terminalIdInput: "",
    displayCsc: v.displayCsc,
    transactionType: v.transactionType,
    detailedDeclines: v.detailedDeclines,
    debugMode: v.debugMode,
    acceptedCardLogos: v.acceptedCardLogos,
  };
}

function row(label: string, helper: string | null, control: React.ReactNode) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 520px",
        gap: 24,
        padding: "18px 0",
        borderBottom: "1px solid #f1f5f9",
        alignItems: "start",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{label}</div>
        {helper && (
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.5 }}>
            {helper}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {control}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

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
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 40,
        height: 22,
        borderRadius: 999,
        background: checked ? "#c41e3a" : "#cbd5e1",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 2,
          top: 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: "transform 120ms ease",
        }}
      />
    </button>
  );
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
        fontSize: 12,
        fontWeight: 600,
        background: colors.bg,
        color: colors.fg,
      }}
    >
      {children}
    </span>
  );
}

function LockedBadge() {
  return (
    <span
      title="Locked: APP_ENCRYPTION_KEY is missing"
      aria-label="Locked: APP_ENCRYPTION_KEY is missing"
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: "#fef3c7",
        color: "#92400e",
      }}
    >
      <span aria-hidden>🔒</span>
      Locked
    </span>
  );
}

export default function AuthNetGatewayForm({ onChanged }: { onChanged?: () => void }) {
  const [api, setApi] = useState<GatewaysApi | null>(null);
  const [original, setOriginal] = useState<FormState | null>(null);
  const [draft, setDraft] = useState<FormState | null>(null);
  const [clearedFields, setClearedFields] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean | null;
    message: string | null;
    timestamp: string | null;
    source: string | null;
  }>({ ok: null, message: null, timestamp: null, source: null });
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, errorMode?: boolean) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, error: errorMode });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/payments/gateways", { cache: "no-store" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to load gateway");
      const data = j.data as GatewaysApi;
      setApi(data);
      const v = data.gateways[0];
      const fresh = fromView(v);
      setOriginal(fresh);
      setDraft(fresh);
      setClearedFields({});
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
    if (JSON.stringify(original) !== JSON.stringify(draft)) return true;
    if (Object.values(clearedFields).some(Boolean)) return true;
    if (
      draft.apiLoginIdInput.trim() ||
      draft.transactionKeyInput.trim() ||
      draft.signatureKeyInput.trim() ||
      draft.merchantIdInput.trim() ||
      draft.terminalIdInput.trim()
    )
      return true;
    return false;
  }, [original, draft, clearedFields]);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }

  function reset() {
    if (original) {
      setDraft(original);
      setClearedFields({});
    }
  }

  async function save() {
    if (!draft || !original || !api) return;
    if (!api.encryptionAvailable) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (draft.enableGateway !== original.enableGateway) body.enableGateway = draft.enableGateway;
      if (draft.environment !== original.environment) body.environment = draft.environment;
      if (draft.connectionType !== original.connectionType)
        body.connectionType = draft.connectionType;
      if (draft.checkoutTitle !== original.checkoutTitle) body.checkoutTitle = draft.checkoutTitle;
      if (draft.checkoutDescription !== original.checkoutDescription)
        body.checkoutDescription = draft.checkoutDescription;
      if (draft.merchantProviderName !== original.merchantProviderName)
        body.merchantProviderName = draft.merchantProviderName.trim() || null;
      if (draft.displayCsc !== original.displayCsc) body.displayCsc = draft.displayCsc;
      if (draft.transactionType !== original.transactionType)
        body.transactionType = draft.transactionType;
      if (draft.detailedDeclines !== original.detailedDeclines)
        body.detailedDeclines = draft.detailedDeclines;
      if (draft.debugMode !== original.debugMode) body.debugMode = draft.debugMode;
      if (JSON.stringify(draft.acceptedCardLogos) !== JSON.stringify(original.acceptedCardLogos))
        body.acceptedCardLogos = draft.acceptedCardLogos;

      // Credential fields: cleared takes precedence; else only send if user typed.
      if (clearedFields.apiLoginId) body.apiLoginId = { clear: true };
      else if (draft.apiLoginIdInput.trim()) body.apiLoginId = draft.apiLoginIdInput;
      if (clearedFields.transactionKey) body.transactionKey = { clear: true };
      else if (draft.transactionKeyInput.trim()) body.transactionKey = draft.transactionKeyInput;
      if (clearedFields.signatureKey) body.signatureKey = { clear: true };
      else if (draft.signatureKeyInput.trim()) body.signatureKey = draft.signatureKeyInput;

      if (clearedFields.merchantId) body.merchantId = { clear: true };
      else if (draft.merchantIdInput.trim()) body.merchantId = draft.merchantIdInput;
      if (clearedFields.terminalId) body.terminalId = { clear: true };
      else if (draft.terminalIdInput.trim()) body.terminalId = draft.terminalIdInput;

      const res = await fetch("/api/v1/admin/payments/gateways/authorize-net", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      showToast("Authorize.net settings saved.");
      await load();
      onChanged?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  }

  async function clearAllCredentials() {
    if (!confirm("Clear all saved Authorize.net credentials? This cannot be undone.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/payments/gateways/authorize-net", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiLoginId: { clear: true },
          transactionKey: { clear: true },
          signatureKey: { clear: true },
          enableGateway: false,
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Clear failed");
      showToast("Saved credentials cleared.");
      await load();
      onChanged?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult({ ok: null, message: null, timestamp: null, source: null });
    try {
      const res = await fetch("/api/v1/admin/payments/gateways/authorize-net/test", {
        method: "POST",
      });
      const j = await res.json();
      setTestResult({
        ok: j.data?.gatewayOk ?? j.ok ?? false,
        message: j.data?.message ?? j.error ?? null,
        timestamp: j.data?.timestamp ?? new Date().toISOString(),
        source: j.data?.source ?? null,
      });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
        source: null,
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 16, color: "#64748b" }}>Loading gateway settings…</div>;
  }
  if (error) {
    return (
      <div
        style={{
          padding: 12,
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#991b1b",
          borderRadius: 8,
        }}
      >
        {error}
      </div>
    );
  }
  if (!api || !draft || !original) return null;

  const view = api.gateways[0];
  const status = !api.encryptionAvailable
    ? ("warn" as const)
    : !view.enableGateway
    ? ("neutral" as const)
    : view.hasApiLoginId && view.hasTransactionKey
    ? ("ok" as const)
    : api.envFallback.apiLoginIdConfigured && api.envFallback.transactionKeyConfigured
    ? ("ok" as const)
    : ("err" as const);
  const statusLabel = !api.encryptionAvailable
    ? "Encryption key missing"
    : !view.enableGateway
    ? "Disabled"
    : status === "ok"
    ? "Active"
    : "Misconfigured";

  function credentialPlaceholder(has: boolean, last4: string | null, envFallback: boolean) {
    if (has && last4) return `Saved ••••${last4}`;
    if (envFallback) return "Using env-var fallback";
    return "Not set";
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        position: "relative",
      }}
    >
      {!api.encryptionAvailable && (
        <div
          style={{
            background: "#fffbeb",
            color: "#92400e",
            padding: "10px 16px",
            borderBottom: "1px solid #fde68a",
            fontSize: 13,
          }}
        >
          <strong>Credential editing unavailable.</strong> APP_ENCRYPTION_KEY is missing. Existing
          env-based credentials will continue to be used at runtime; ask your platform admin to set
          APP_ENCRYPTION_KEY before saving new credentials here.
        </div>
      )}

      <div style={{ padding: "18px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            Authorize.net Credit Card
          </h2>
          <Pill variant={status}>{statusLabel}</Pill>
          <Pill variant={view.environment === "production" ? "warn" : "neutral"}>
            {view.environment}
          </Pill>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
          Credentials are AES-256-GCM encrypted before storage. Raw values are never displayed
          after saving.
        </p>
      </div>

      <div style={{ padding: "0 20px" }}>
        {/* Gateway section */}
        <div style={{ padding: "12px 0", borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Gateway
          </h3>
        </div>
        {row(
          "Enable this gateway",
          "When off, checkout will not use Authorize.net even if credentials are saved.",
          <Toggle
            ariaLabel="Enable Authorize.net"
            checked={draft.enableGateway}
            onChange={(v) => update("enableGateway", v)}
          />
        )}
        {row(
          "Environment",
          "Sandbox is safe for testing; production processes real cards.",
          <div
            style={{
              display: "inline-flex",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {(["sandbox", "production"] as const).map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={draft.environment === e}
                onClick={() => update("environment", e)}
                style={{
                  padding: "8px 14px",
                  background: draft.environment === e ? "#c41e3a" : "#fff",
                  color: draft.environment === e ? "#fff" : "#334155",
                  border: "none",
                  borderRight: e === "sandbox" ? "1px solid #cbd5e1" : "none",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {e === "sandbox" ? "Sandbox" : "Production"}
              </button>
            ))}
          </div>
        )}
        {row(
          "Connection type",
          "Gateway-only: card processing only. All-in-one: bundled with merchant account.",
          <select
            style={inputStyle}
            value={draft.connectionType}
            onChange={(e) =>
              update("connectionType", e.target.value as FormState["connectionType"])
            }
          >
            <option value="gateway_only">Gateway-only</option>
            <option value="all_in_one">All-in-one</option>
          </select>
        )}
        {row(
          "Checkout title",
          "Shown to guests on the payment selection screen.",
          <input
            type="text"
            style={inputStyle}
            value={draft.checkoutTitle}
            onChange={(e) => update("checkoutTitle", e.target.value)}
          />
        )}
        {row(
          "Checkout description",
          null,
          <textarea
            style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
            value={draft.checkoutDescription}
            onChange={(e) => update("checkoutDescription", e.target.value)}
          />
        )}

        {/* Connection settings */}
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Connection settings
          </h3>
        </div>
        {!api.encryptionAvailable && (
          <div
            role="note"
            style={{
              margin: "12px 0 4px",
              padding: "10px 12px",
              background: "#fef3c7",
              border: "1px solid #fde68a",
              borderRadius: 6,
              fontSize: 13,
              color: "#92400e",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <span aria-hidden style={{ fontSize: 14, lineHeight: "20px" }}>🔒</span>
            <span>
              <strong>Credential editing is locked</strong> because{" "}
              <code>APP_ENCRYPTION_KEY</code> is missing. Add{" "}
              <code>APP_ENCRYPTION_KEY</code> in Secrets and restart the app to
              edit these fields. Non-secret options above remain editable.
            </span>
          </div>
        )}
        {row(
          "API Login ID",
          api.envFallback.apiLoginIdConfigured && !view.hasApiLoginId
            ? "Currently using env-var AUTHORIZE_NET_API_LOGIN_ID. Type a value here to take over."
            : "Leave blank to keep the saved value.",
          <>
            <input
              type="text"
              style={inputStyle}
              autoComplete="off"
              placeholder={credentialPlaceholder(
                view.hasApiLoginId,
                view.apiLoginIdLast4,
                api.envFallback.apiLoginIdConfigured
              )}
              value={draft.apiLoginIdInput}
              onChange={(e) => {
                update("apiLoginIdInput", e.target.value);
                if (clearedFields.apiLoginId)
                  setClearedFields((c) => ({ ...c, apiLoginId: false }));
              }}
              disabled={!api.encryptionAvailable}
              aria-disabled={!api.encryptionAvailable}
            />
            {!api.encryptionAvailable && <LockedBadge />}
            {view.hasApiLoginId && !clearedFields.apiLoginId && (
              <button
                type="button"
                onClick={() => setClearedFields((c) => ({ ...c, apiLoginId: true }))}
                style={{
                  alignSelf: "flex-start",
                  fontSize: 12,
                  color: "#c41e3a",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Clear saved value
              </button>
            )}
            {clearedFields.apiLoginId && (
              <span style={{ fontSize: 12, color: "#92400e" }}>
                Will be cleared on save.{" "}
                <button
                  type="button"
                  onClick={() => setClearedFields((c) => ({ ...c, apiLoginId: false }))}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#1d4ed8",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Undo
                </button>
              </span>
            )}
          </>
        )}
        {row(
          "Transaction Key",
          null,
          <>
            <input
              type="password"
              style={inputStyle}
              autoComplete="new-password"
              placeholder={credentialPlaceholder(
                view.hasTransactionKey,
                view.transactionKeyLast4,
                api.envFallback.transactionKeyConfigured
              )}
              value={draft.transactionKeyInput}
              onChange={(e) => {
                update("transactionKeyInput", e.target.value);
                if (clearedFields.transactionKey)
                  setClearedFields((c) => ({ ...c, transactionKey: false }));
              }}
              disabled={!api.encryptionAvailable}
              aria-disabled={!api.encryptionAvailable}
            />
            {!api.encryptionAvailable && <LockedBadge />}
            {view.hasTransactionKey && !clearedFields.transactionKey && (
              <button
                type="button"
                onClick={() => setClearedFields((c) => ({ ...c, transactionKey: true }))}
                style={{
                  alignSelf: "flex-start",
                  fontSize: 12,
                  color: "#c41e3a",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Clear saved value
              </button>
            )}
          </>
        )}
        {row(
          "Signature Key",
          "Optional. Used for webhook signature verification.",
          <>
            <input
              type="password"
              style={inputStyle}
              autoComplete="new-password"
              placeholder={credentialPlaceholder(view.hasSignatureKey, view.signatureKeyLast4, false)}
              value={draft.signatureKeyInput}
              onChange={(e) => {
                update("signatureKeyInput", e.target.value);
                if (clearedFields.signatureKey)
                  setClearedFields((c) => ({ ...c, signatureKey: false }));
              }}
              disabled={!api.encryptionAvailable}
              aria-disabled={!api.encryptionAvailable}
            />
            {!api.encryptionAvailable && <LockedBadge />}
            {view.hasSignatureKey && !clearedFields.signatureKey && (
              <button
                type="button"
                onClick={() => setClearedFields((c) => ({ ...c, signatureKey: true }))}
                style={{
                  alignSelf: "flex-start",
                  fontSize: 12,
                  color: "#c41e3a",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Clear saved value
              </button>
            )}
          </>
        )}
        {row(
          "Merchant provider name",
          "Free text — e.g. Banesco, FAC, etc.",
          <input
            type="text"
            style={inputStyle}
            value={draft.merchantProviderName}
            onChange={(e) => update("merchantProviderName", e.target.value)}
          />
        )}
        {row(
          "Merchant ID",
          view.merchantIdLast4
            ? `Saved last 4: ${view.merchantIdLast4}. Stored masked only.`
            : "Stored masked only.",
          <input
            type="text"
            style={inputStyle}
            placeholder={view.merchantIdLast4 ? `••••${view.merchantIdLast4}` : "Not set"}
            value={draft.merchantIdInput}
            onChange={(e) => update("merchantIdInput", e.target.value)}
          />
        )}
        {row(
          "Terminal ID",
          "Stored masked only.",
          <input
            type="text"
            style={inputStyle}
            placeholder={view.terminalIdLast4 ? `••••${view.terminalIdLast4}` : "Not set"}
            value={draft.terminalIdInput}
            onChange={(e) => update("terminalIdInput", e.target.value)}
          />
        )}

        {/* Checkout behavior */}
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Checkout behavior
          </h3>
        </div>
        {row(
          "Display CSC",
          "Require the card security code at checkout.",
          <Toggle
            ariaLabel="Display CSC"
            checked={draft.displayCsc}
            onChange={(v) => update("displayCsc", v)}
          />
        )}
        {row(
          "Transaction type",
          "Charge: capture immediately. Authorize only: capture later.",
          <select
            style={inputStyle}
            value={draft.transactionType}
            onChange={(e) =>
              update("transactionType", e.target.value as FormState["transactionType"])
            }
          >
            <option value="charge">Charge immediately</option>
            <option value="authorize_only">Authorize only</option>
          </select>
        )}
        {row(
          "Accepted card logos",
          "Shown on the checkout page.",
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CARD_OPTIONS.map((c) => {
              const checked = draft.acceptedCardLogos.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={checked}
                  onClick={() =>
                    update(
                      "acceptedCardLogos",
                      checked
                        ? draft.acceptedCardLogos.filter((v) => v !== c.value)
                        : [...draft.acceptedCardLogos, c.value]
                    )
                  }
                  style={{
                    padding: "6px 10px",
                    border: "1px solid",
                    borderColor: checked ? "#c41e3a" : "#cbd5e1",
                    background: checked ? "#fdf2f4" : "#fff",
                    color: checked ? "#c41e3a" : "#334155",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
        {row(
          "Detailed decline messages",
          "Surface gateway decline reasons to operators.",
          <Toggle
            ariaLabel="Detailed declines"
            checked={draft.detailedDeclines}
            onChange={(v) => update("detailedDeclines", v)}
          />
        )}
        {row(
          "Debug mode",
          null,
          <>
            <select
              style={inputStyle}
              value={draft.debugMode}
              onChange={(e) => update("debugMode", e.target.value as FormState["debugMode"])}
            >
              <option value="off">Off</option>
              <option value="errors">Errors only</option>
              <option value="verbose">Verbose</option>
            </select>
            {draft.debugMode === "verbose" && (
              <div
                style={{
                  background: "#fffbeb",
                  color: "#92400e",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                Verbose logs must never include card data, secrets, or full gateway payloads.
              </div>
            )}
          </>
        )}

        {/* Test + danger */}
        <div
          style={{
            padding: "18px 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                fontSize: 13,
                fontWeight: 600,
                cursor: testing ? "wait" : "pointer",
              }}
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult.ok !== null && (
              <span style={{ fontSize: 13 }}>
                <Pill variant={testResult.ok ? "ok" : "err"}>
                  {testResult.ok ? "OK" : "Failed"}
                </Pill>{" "}
                {testResult.message && (
                  <span style={{ color: "#334155" }}>{testResult.message}</span>
                )}{" "}
                {testResult.source && (
                  <span style={{ color: "#94a3b8" }}>· source: {testResult.source}</span>
                )}
              </span>
            )}
          </div>
          {(view.hasApiLoginId || view.hasTransactionKey || view.hasSignatureKey) && (
            <button
              type="button"
              onClick={clearAllCredentials}
              disabled={saving}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #fecaca",
                background: "#fff",
                color: "#991b1b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear saved credentials
            </button>
          )}
        </div>
      </div>

      {dirty && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "#fff",
            borderTop: "1px solid #e2e8f0",
            padding: "12px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Unsaved changes</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !api.encryptionAvailable}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #c41e3a",
                background: "#c41e3a",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
                opacity: !api.encryptionAvailable ? 0.5 : 1,
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </span>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: toast.error ? "#c41e3a" : "#0f172a",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
