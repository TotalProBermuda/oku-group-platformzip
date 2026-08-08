"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CybersourceEnvironment = "test" | "production";
type DebugMode = "OFF" | "ERRORS_ONLY" | "VERBOSE";
type FieldStatus = "missing" | "saved" | "optional";

interface SafeView {
  provider: "CYBERSOURCE";
  enabled: boolean;
  environment: CybersourceEnvironment;
  configured: boolean;
  credentialSource: "database" | "environment" | "none";
  credentialStatus: {
    merchantId: FieldStatus;
    keyId: FieldStatus;
    sharedSecret: FieldStatus;
    organizationId: FieldStatus;
    portfolioId: FieldStatus;
  };
  masked: {
    merchantId: string | null;
    keyId: string | null;
    sharedSecret: string | null;
    organizationId: string | null;
    portfolioId: string | null;
  };
  publicSettings: {
    checkoutTitle: string;
    checkoutDescription: string;
    acceptedCardLogos: string[];
    cardSecurityCodeEnabled: boolean;
    detailedDeclineMessagesEnabled: boolean;
    debugMode: DebugMode;
  };
  lastTest: {
    status: "passed" | "failed" | null;
    message: string | null;
    timestamp: string | null;
  } | null;
  canEditCredentials: boolean;
  updatedAt: string | null;
}

interface CybersourceApi {
  encryptionAvailable: boolean;
  gateway: SafeView;
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
  enabled: boolean;
  environment: CybersourceEnvironment;
  checkoutTitle: string;
  checkoutDescription: string;
  acceptedCardLogos: string[];
  cardSecurityCodeEnabled: boolean;
  detailedDeclineMessagesEnabled: boolean;
  debugMode: DebugMode;
  merchantIdInput: string;
  keyIdInput: string;
  sharedSecretInput: string;
  organizationIdInput: string;
  portfolioIdInput: string;
};

function fromView(v: SafeView): FormState {
  return {
    enabled: v.enabled,
    environment: v.environment,
    checkoutTitle: v.publicSettings.checkoutTitle,
    checkoutDescription: v.publicSettings.checkoutDescription,
    acceptedCardLogos: v.publicSettings.acceptedCardLogos,
    cardSecurityCodeEnabled: v.publicSettings.cardSecurityCodeEnabled,
    detailedDeclineMessagesEnabled: v.publicSettings.detailedDeclineMessagesEnabled,
    debugMode: v.publicSettings.debugMode,
    merchantIdInput: "",
    keyIdInput: "",
    sharedSecretInput: "",
    organizationIdInput: "",
    portfolioIdInput: "",
  };
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

function Toggle({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        position: "relative",
        width: 40,
        height: 22,
        borderRadius: 999,
        background: checked ? "#0f766e" : "#cbd5e1",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        opacity: disabled ? 0.6 : 1,
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

function credentialPlaceholder(status: FieldStatus, last4: string | null): string {
  if (status === "saved") return last4 ? `Saved ••••${last4}` : "Saved";
  if (status === "optional") return "Optional";
  return "Missing";
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

export default function CybersourceGatewayForm({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [api, setApi] = useState<CybersourceApi | null>(null);
  const [original, setOriginal] = useState<FormState | null>(null);
  const [draft, setDraft] = useState<FormState | null>(null);
  const [clearedFields, setClearedFields] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean | null;
    message: string | null;
    timestamp: string | null;
    httpStatus: number | null;
  }>({ ok: null, message: null, timestamp: null, httpStatus: null });
  const [testPersistenceFailed, setTestPersistenceFailed] = useState(false);
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
      const res = await fetch("/api/v1/admin/payments/cybersource", {
        cache: "no-store",
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to load Cybersource gateway");
      const data = j.data as CybersourceApi;
      setApi(data);
      const fresh = fromView(data.gateway);
      setOriginal(fresh);
      setDraft(fresh);
      setClearedFields({});
      const lt = data.gateway.lastTest;
      if (lt && lt.timestamp) {
        setTestResult({
          ok: lt.status === "passed",
          message: lt.message,
          timestamp: lt.timestamp,
          httpStatus: null,
        });
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
    if (JSON.stringify(original) !== JSON.stringify(draft)) return true;
    if (Object.values(clearedFields).some(Boolean)) return true;
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
      if (draft.enabled !== original.enabled) body.enabled = draft.enabled;
      if (draft.environment !== original.environment) body.environment = draft.environment;
      if (draft.checkoutTitle !== original.checkoutTitle) body.checkoutTitle = draft.checkoutTitle;
      if (draft.checkoutDescription !== original.checkoutDescription)
        body.checkoutDescription = draft.checkoutDescription;
      if (
        JSON.stringify(draft.acceptedCardLogos) !==
        JSON.stringify(original.acceptedCardLogos)
      )
        body.acceptedCardLogos = draft.acceptedCardLogos;
      if (draft.cardSecurityCodeEnabled !== original.cardSecurityCodeEnabled)
        body.cardSecurityCodeEnabled = draft.cardSecurityCodeEnabled;
      if (draft.detailedDeclineMessagesEnabled !== original.detailedDeclineMessagesEnabled)
        body.detailedDeclineMessagesEnabled = draft.detailedDeclineMessagesEnabled;
      if (draft.debugMode !== original.debugMode) body.debugMode = draft.debugMode;

      const credentialFields: Array<[
        keyof FormState,
        "merchantId" | "keyId" | "sharedSecret" | "organizationId" | "portfolioId"
      ]> = [
        ["merchantIdInput", "merchantId"],
        ["keyIdInput", "keyId"],
        ["sharedSecretInput", "sharedSecret"],
        ["organizationIdInput", "organizationId"],
        ["portfolioIdInput", "portfolioId"],
      ];
      for (const [inputKey, bodyKey] of credentialFields) {
        if (clearedFields[bodyKey]) {
          body[bodyKey] = { clear: true };
        } else {
          const v = (draft[inputKey] as string).trim();
          if (v) body[bodyKey] = v;
        }
      }

      const res = await fetch("/api/v1/admin/payments/cybersource", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      showToast("Cybersource settings saved.");
      await load();
      onChanged?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  }

  async function clearAllCredentials() {
    if (
      !confirm(
        "Clear all saved Cybersource credentials? This cannot be undone and will disable the gateway."
      )
    )
      return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/payments/cybersource/clear", {
        method: "POST",
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Clear failed");
      showToast("Saved Cybersource credentials cleared.");
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
    setTestResult({ ok: null, message: null, timestamp: null, httpStatus: null });
    setTestPersistenceFailed(false);
    try {
      const res = await fetch("/api/v1/admin/payments/cybersource/test", {
        method: "POST",
      });
      const j = await res.json();

      if (j.data?.persistenceFailed) {
        // The live Cybersource probe may have succeeded, but the result could
        // not be written to the DB. Card badge and readiness banner both read
        // DB state — do NOT surface this as "Last test passed." Show the
        // persistence error instead, and reload so DB state is displayed.
        setTestPersistenceFailed(true);
        await load();
        return;
      }

      setTestResult({
        ok: j.data?.gatewayOk ?? j.ok ?? false,
        message: j.data?.message ?? j.error ?? null,
        timestamp: j.data?.timestamp ?? new Date().toISOString(),
        httpStatus: j.data?.httpStatus ?? null,
      });
      // Reload to pull persisted lastTest into the form view from DB.
      await load();
      // Notify the parent page so the global readiness banner refreshes
      // immediately without a manual page reload.
      if (j.ok) {
        onChanged?.();
      }
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
        httpStatus: null,
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 16, color: "#64748b" }}>Loading Cybersource settings…</div>;
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

  const view = api.gateway;
  const allRequiredSaved =
    view.credentialStatus.merchantId === "saved" &&
    view.credentialStatus.keyId === "saved" &&
    view.credentialStatus.sharedSecret === "saved";

  const status = !api.encryptionAvailable
    ? ("warn" as const)
    : !view.enabled
    ? !allRequiredSaved
      ? ("neutral" as const)
      : ("neutral" as const)
    : allRequiredSaved
    ? ("ok" as const)
    : ("err" as const);

  const statusLabel = !api.encryptionAvailable
    ? "Encryption key missing"
    : !view.enabled
    ? allRequiredSaved
      ? "Configured"
      : "Not configured"
    : allRequiredSaved
    ? "Enabled"
    : "Misconfigured";

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
          <strong>Credential editing unavailable.</strong> APP_ENCRYPTION_KEY is missing. Ask your
          platform admin to set APP_ENCRYPTION_KEY before saving Cybersource credentials.
        </div>
      )}

      <div style={{ padding: "18px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            Cybersource
          </h2>
          <Pill variant={status}>{statusLabel}</Pill>
          <Pill variant={view.environment === "production" ? "warn" : "neutral"}>
            {view.environment}
          </Pill>
          {view.lastTest?.status && (
            <Pill variant={view.lastTest.status === "passed" ? "ok" : "err"}>
              Last test {view.lastTest.status}
            </Pill>
          )}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
          Accept card payments through Cybersource using REST API credentials. Credentials are
          AES-256-GCM encrypted and never displayed after saving.
        </p>
      </div>

      <div style={{ padding: "0 20px" }}>
        {/* Cybersource Status */}
        <div style={{ padding: "12px 0", borderBottom: "1px solid #e2e8f0" }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Cybersource Status
          </h3>
        </div>
        {row(
          "Enable this gateway",
          "When off, checkout will not use Cybersource even if credentials are saved.",
          <Toggle
            ariaLabel="Enable Cybersource"
            checked={draft.enabled}
            onChange={(v) => update("enabled", v)}
            disabled={!api.encryptionAvailable}
          />
        )}
        {row(
          "Environment",
          "Test uses apitest.cybersource.com; production processes real cards via api.cybersource.com.",
          <div
            style={{
              display: "inline-flex",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {(["test", "production"] as const).map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={draft.environment === e}
                onClick={() => update("environment", e)}
                style={{
                  padding: "8px 14px",
                  background: draft.environment === e ? "#0f766e" : "#fff",
                  color: draft.environment === e ? "#fff" : "#334155",
                  border: "none",
                  borderRight: e === "test" ? "1px solid #cbd5e1" : "none",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {e === "test" ? "Test" : "Production"}
              </button>
            ))}
          </div>
        )}

        {/* Connection Credentials */}
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid #e2e8f0" }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Connection Credentials
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
        {[
          {
            key: "merchantId" as const,
            inputKey: "merchantIdInput" as const,
            label: "Merchant ID",
            helper: "Cybersource Merchant ID (required).",
            type: "text",
          },
          {
            key: "keyId" as const,
            inputKey: "keyIdInput" as const,
            label: "API Key ID",
            helper: "Cybersource REST API Key ID (required).",
            type: "text",
          },
          {
            key: "sharedSecret" as const,
            inputKey: "sharedSecretInput" as const,
            label: "Shared Secret",
            helper:
              "Base64-encoded shared secret paired with the Key ID (required, never displayed).",
            type: "password",
          },
          {
            key: "organizationId" as const,
            inputKey: "organizationIdInput" as const,
            label: "Organization ID",
            helper: "Optional. Used for meta-key / portfolio setups.",
            type: "text",
          },
          {
            key: "portfolioId" as const,
            inputKey: "portfolioIdInput" as const,
            label: "Portfolio ID",
            helper: "Optional. Portfolio identifier.",
            type: "text",
          },
        ].map(({ key, inputKey, label, helper, type }) => {
          const fieldStatus = view.credentialStatus[key];
          const last4 = view.masked[key];
          return (
            <div key={key}>
              {row(
                label,
                helper,
                <>
                  <input
                    type={type}
                    style={inputStyle}
                    autoComplete="new-password"
                    placeholder={credentialPlaceholder(fieldStatus, last4)}
                    value={draft[inputKey]}
                    onChange={(e) => {
                      update(inputKey, e.target.value as FormState[typeof inputKey]);
                      if (clearedFields[key])
                        setClearedFields((c) => ({ ...c, [key]: false }));
                    }}
                    disabled={!api.encryptionAvailable}
                    aria-disabled={!api.encryptionAvailable}
                  />
                  {!api.encryptionAvailable && <LockedBadge />}
                  {fieldStatus === "saved" && !clearedFields[key] && (
                    <button
                      type="button"
                      onClick={() => setClearedFields((c) => ({ ...c, [key]: true }))}
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
                  {clearedFields[key] && (
                    <span style={{ fontSize: 12, color: "#92400e" }}>
                      Will be cleared on save.{" "}
                      <button
                        type="button"
                        onClick={() => setClearedFields((c) => ({ ...c, [key]: false }))}
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
            </div>
          );
        })}

        {/* Checkout Display */}
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid #e2e8f0" }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Checkout Display
          </h3>
        </div>
        {row(
          "Checkout title",
          "Shown to guests on the payment selection screen.",
          <input
            type="text"
            style={inputStyle}
            value={draft.checkoutTitle}
            onChange={(e) => update("checkoutTitle", e.target.value)}
            maxLength={80}
          />
        )}
        {row(
          "Checkout description",
          null,
          <textarea
            style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
            value={draft.checkoutDescription}
            onChange={(e) => update("checkoutDescription", e.target.value)}
            maxLength={240}
          />
        )}
        {row(
          "Accepted card logos",
          "Card brands shown on the checkout screen.",
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CARD_OPTIONS.map((opt) => {
              const checked = draft.acceptedCardLogos.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    background: checked ? "#ecfeff" : "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...draft.acceptedCardLogos, opt.value]
                        : draft.acceptedCardLogos.filter((v) => v !== opt.value);
                      update("acceptedCardLogos", next);
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        )}
        {row(
          "Card security code (CSC)",
          "Require 3- or 4-digit security code on checkout.",
          <Toggle
            ariaLabel="Card security code"
            checked={draft.cardSecurityCodeEnabled}
            onChange={(v) => update("cardSecurityCodeEnabled", v)}
          />
        )}

        {/* Risk & Debugging */}
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid #e2e8f0" }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Risk & Debugging
          </h3>
        </div>
        {row(
          "Detailed decline messages",
          "Show specific decline reasons on checkout (off = generic message).",
          <Toggle
            ariaLabel="Detailed decline messages"
            checked={draft.detailedDeclineMessagesEnabled}
            onChange={(v) => update("detailedDeclineMessagesEnabled", v)}
          />
        )}
        {row(
          "Debug mode",
          "Controls how much gateway request/response context is logged. VERBOSE may include sanitized payloads.",
          <select
            style={inputStyle}
            value={draft.debugMode}
            onChange={(e) => update("debugMode", e.target.value as DebugMode)}
          >
            <option value="OFF">Off</option>
            <option value="ERRORS_ONLY">Errors only</option>
            <option value="VERBOSE">Verbose</option>
          </select>
        )}

        {/* Test Result */}
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid #e2e8f0" }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Test Result
          </h3>
        </div>
        <div style={{ padding: "16px 0 24px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !allRequiredSaved}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#fff",
              cursor: testing ? "wait" : "pointer",
              opacity: !allRequiredSaved ? 0.5 : 1,
              fontSize: 13,
            }}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          {!allRequiredSaved && (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Save Merchant ID, Key ID, and Shared Secret before testing.
            </span>
          )}
          {testPersistenceFailed && (
            <span
              style={{
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: "#fef3c7",
                border: "1px solid #fde68a",
                borderRadius: 6,
                color: "#92400e",
              }}
            >
              Connection succeeded but the test result could not be saved. Please retry or contact admin.
            </span>
          )}
          {!testPersistenceFailed && testResult.ok !== null && (
            <span
              style={{
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Pill variant={testResult.ok ? "ok" : "err"}>
                {testResult.ok ? "Passed" : "Failed"}
              </Pill>
              {testResult.message && <span style={{ color: "#334155" }}>{testResult.message}</span>}
              {testResult.httpStatus != null && (
                <span style={{ color: "#94a3b8" }}>· HTTP {testResult.httpStatus}</span>
              )}
              {testResult.timestamp && (
                <span style={{ color: "#94a3b8" }}>
                  · {new Date(testResult.timestamp).toLocaleString()}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Sticky save bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
          padding: "12px 20px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving || !api.encryptionAvailable}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#0f766e",
            color: "#fff",
            cursor: !dirty || saving ? "not-allowed" : "pointer",
            opacity: !dirty || saving ? 0.5 : 1,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {saving ? "Saving…" : "Save Cybersource settings"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!dirty || saving}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#334155",
            cursor: !dirty || saving ? "not-allowed" : "pointer",
            opacity: !dirty || saving ? 0.5 : 1,
            fontSize: 13,
          }}
        >
          Discard changes
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={clearAllCredentials}
          disabled={saving || (!view.credentialStatus.merchantId && !view.credentialStatus.keyId)}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #fecaca",
            background: "#fff",
            color: "#991b1b",
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          Clear saved credentials
        </button>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "10px 14px",
            background: toast.error ? "#7f1d1d" : "#0f172a",
            color: "#fff",
            borderRadius: 8,
            boxShadow: "0 6px 18px rgba(15,23,42,0.25)",
            zIndex: 50,
            fontSize: 13,
            maxWidth: 360,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
