"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, ChevronLeft, Link2 } from "lucide-react";
import { useTranslation } from "@/i18n/useTranslation";
import {
  type OperatorContainer,
  describeContainer,
} from "@/lib/operatorContainer";

type OperatorTypeOption = {
  code: string;            // ReferralActorTypeDef.code (preferred submit field)
  legacyEnumValue: string; // Back-compat enum
  label: string;
  defaultCompMode: string;
  defaultRateBps: number | null;
  defaultFlatCents: number | null;
};

const COMP_MODES: { value: string; label: string; needsRate?: boolean; needsFlat?: boolean }[] = [
  { value: "NONE",                          label: "No commission" },
  { value: "PERCENT_OF_TRANSACTION",        label: "% of transaction",        needsRate: true },
  { value: "PERCENT_OF_PARENT_COMMISSION",  label: "% of parent commission",  needsRate: true },
  { value: "FLAT_PER_COVER",                label: "Flat / cover",            needsFlat: true },
  { value: "FLAT_PER_PARTY",                label: "Flat / party",            needsFlat: true },
];

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #e0d9d3",
  borderRadius: 8, fontSize: 14, background: "#fff", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.07em", color: "#7d7269", marginBottom: 5,
};

export type AddOperatorModalProps = {
  container: OperatorContainer;
  /** Optional context for the confirmation text (e.g. parent entity name). */
  contextNames?: { entityName?: string | null; scopeName?: string | null; referrerName?: string | null };
  /** Optional initial display name (e.g. legacy referrer's full name). */
  initialDisplayName?: string;
  onClose: () => void;
  onCreated: (info: {
    mode: "activate" | "userOnly";
    actorId: string | null;
    linkCode: string | null;
    linkUrl: string | null;
    createdUserId: string | null;
  }) => void;
};

type EmailCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "exists"; userId: string; name: string | null }
  | { status: "error"; error: string };

export default function AddOperatorModal({
  container, contextNames, initialDisplayName, onClose, onCreated,
}: AddOperatorModalProps) {
  const { t: tr } = useTranslation();
  const t = (k: string, fallback: string) => {
    const v = tr("referrals", k);
    return v && v !== k ? v : fallback;
  };

  const [step, setStep] = useState<"form" | "confirm">("form");
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  // Operator types are loaded from the ReferralActorTypeDef catalog so admins
  // can register custom types without a code change. Container-aware default:
  // solo-referrer → "private-network", everything else → "streetside-host".
  const [operatorTypes, setOperatorTypes] = useState<OperatorTypeOption[]>([]);
  const [typesState, setTypesState] = useState<"loading" | "loaded" | "empty" | "error">("loading");
  const defaultActorTypeCode =
    container.kind === "soloReferrer" ? "private-network" : "streetside-host";
  const [actorTypeCode, setActorTypeCode] = useState(defaultActorTypeCode);
  useEffect(() => {
    let cancelled = false;
    setTypesState("loading");
    fetch("/api/v1/admin/operator-types")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        const raw = Array.isArray(d?.types) ? d.types : [];
        const opts: OperatorTypeOption[] = raw.map((t: {
          code: string; label: string; legacyEnumValue: string;
          defaultCompMode: string; defaultRateBps: number | null; defaultFlatCents: number | null;
        }) => ({
          code: t.code, label: t.label, legacyEnumValue: t.legacyEnumValue,
          defaultCompMode: t.defaultCompMode, defaultRateBps: t.defaultRateBps, defaultFlatCents: t.defaultFlatCents,
        }));
        setOperatorTypes(opts);
        setTypesState(opts.length === 0 ? "empty" : "loaded");
        // If the container default is missing (e.g. admin disabled it), fall back to first available.
        if (opts.length > 0 && !opts.find((o) => o.code === defaultActorTypeCode)) {
          setActorTypeCode(opts[0].code);
        }
      })
      .catch(() => { if (!cancelled) setTypesState("error"); });
    return () => { cancelled = true; };
  }, [defaultActorTypeCode]);
  const selectedType = operatorTypes.find((o) => o.code === actorTypeCode);
  const [compMode, setCompMode] = useState("NONE");
  const [ratePct, setRatePct] = useState<string>("10");
  const [flatDollars, setFlatDollars] = useState<string>("5.00");
  const [emailCheck, setEmailCheck] = useState<EmailCheckState>({ status: "idle" });
  /** Set when admin explicitly confirms "link the existing user instead". */
  const [linkExistingUserId, setLinkExistingUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<null | "activate" | "userOnly">(null);
  const [error, setError] = useState<string | null>(null);

  const compMeta = useMemo(() => COMP_MODES.find(m => m.value === compMode)!, [compMode]);
  const containerLabel = useMemo(() => describeContainer(container, contextNames), [container, contextNames]);

  // Email collision pre-flight runs whenever an email is present (debounced).
  // Every operator is anchored to a User row, so collisions must be resolved
  // (either by linking the existing user or by changing the email) before
  // either submit action is allowed.
  useEffect(() => {
    const e = email.trim().toLowerCase();
    if (!e) {
      setEmailCheck({ status: "idle" });
      setLinkExistingUserId(null);
      return;
    }
    setEmailCheck({ status: "checking" });
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/operators/check-email?email=${encodeURIComponent(e)}`);
        const d = await r.json();
        if (!d.ok) {
          setEmailCheck({ status: "error", error: d.error ?? "Failed to check email" });
          return;
        }
        if (d.exists) {
          setEmailCheck({ status: "exists", userId: d.user.id, name: d.user.name });
          // Re-confirm linking when email changes.
          setLinkExistingUserId(null);
        } else {
          setEmailCheck({ status: "ok" });
          setLinkExistingUserId(null);
        }
      } catch (err) {
        setEmailCheck({ status: "error", error: (err as Error).message });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [email]);

  const emailExistsBlocking =
    emailCheck.status === "exists" && linkExistingUserId !== emailCheck.userId;

  const formValid =
    displayName.trim().length > 0 &&
    email.trim().length > 0 &&
    emailCheck.status !== "checking" &&
    !emailExistsBlocking &&
    typesState === "loaded" &&
    !!selectedType &&
    (!compMeta.needsRate || (Number(ratePct) > 0 && Number(ratePct) <= 100)) &&
    (!compMeta.needsFlat || Number(flatDollars) > 0);

  const compensationSummary = useMemo(() => {
    if (compMode === "NONE") return t("operatorCta_noCommission", "earns no commission");
    if (compMeta.needsRate) return `${ratePct}% — ${compMeta.label}`;
    if (compMeta.needsFlat) return `$${flatDollars} — ${compMeta.label}`;
    return compMeta.label;
  }, [compMode, compMeta, ratePct, flatDollars, t]);

  const confirmationText = useMemo(() => {
    const role = selectedType?.label ?? actorTypeCode;
    const who = `${displayName.trim()}${organizationName ? ` (${organizationName.trim()})` : ""}`;
    let loginPart: string;
    if (linkExistingUserId) {
      loginPart = t("operatorCta_confirmLoginLink", "The existing user account with this email will be linked to this operator.");
    } else {
      loginPart = t("operatorCta_confirmLoginYes", "A platform login will be created and the operator will receive a referral code.");
    }
    return `${t("operatorCta_confirmAbout", "About to add")} ${who} ${t("operatorCta_confirmAs", "as a")} ${role} ${t("operatorCta_confirmOn", "on")} ${containerLabel}. ${t("operatorCta_confirmThey", "They")} ${compensationSummary}. ${loginPart}`;
  }, [actorTypeCode, selectedType, displayName, organizationName, linkExistingUserId, containerLabel, compensationSummary, t]);

  const submit = async (mode: "activate" | "userOnly") => {
    setSubmitting(mode);
    setError(null);
    try {
      const compensation: Record<string, unknown> = { mode: compMode };
      if (compMeta.needsRate) compensation.rateBps = Math.round(Number(ratePct) * 100);
      if (compMeta.needsFlat) compensation.flatAmountCents = Math.round(Number(flatDollars) * 100);

      // Every operator is backed by a User. Either link an explicitly-
      // confirmed existing one, or let the API provision one from the email.
      const userPayload = linkExistingUserId
        ? { attachExistingUserId: linkExistingUserId }
        : {};

      const res = await fetch("/api/v1/operators/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          container,
          actor: {
            actorTypeCode,
            actorType: selectedType?.legacyEnumValue ?? "OTHER",
            displayName: displayName.trim(),
            organizationName: organizationName.trim() || null,
            phone: phone.trim() || null,
            email: email.trim(),
            whatsapp: whatsapp.trim() || null,
          },
          compensation,
          user: userPayload,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Failed to create operator");
      onCreated({
        mode: d.mode ?? mode,
        actorId: d.actorId ?? null,
        linkCode: d.linkCode ?? null,
        linkUrl: d.linkUrl ?? null,
        createdUserId: d.createdUserId ?? null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "92vh", overflow: "auto", padding: "24px 28px", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22 }}>
              {t("operatorCta_title", "Add operator")}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7d7269" }}>
              {t("operatorCta_subtitle", "Onboard to")} {containerLabel}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#7d7269" }}>×</button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        {step === "form" && (
          <div>
            <Row>
              <Field label={t("operatorCta_displayName", "Display name *")}>
                <input style={fieldStyle} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Carlos Méndez" />
              </Field>
              <Field label={t("operatorCta_actorType", "Operator type *")}>
                <select
                  style={fieldStyle}
                  value={actorTypeCode}
                  onChange={e => setActorTypeCode(e.target.value)}
                  disabled={typesState !== "loaded"}
                >
                  {typesState === "loading" && <option value="">Loading types…</option>}
                  {typesState === "empty" && <option value="">No active types — add one first</option>}
                  {typesState === "error" && <option value="">Could not load types</option>}
                  {typesState === "loaded" && operatorTypes.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
                </select>
                {typesState === "error" && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#c41e3a" }}>
                    Failed to load operator types. Refresh the page or contact an admin.
                  </div>
                )}
                {typesState === "empty" && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#c41e3a" }}>
                    No operator types available.{" "}
                    <a href="/admin/operator-types" target="_blank" rel="noreferrer" style={{ color: "#c41e3a", textDecoration: "underline" }}>
                      Add one →
                    </a>
                  </div>
                )}
                {typesState === "loaded" && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af" }}>
                    Need a new type?{" "}
                    <a href="/admin/operator-types" target="_blank" rel="noreferrer" style={{ color: "#c41e3a", textDecoration: "underline" }}>
                      Manage operator types →
                    </a>
                  </div>
                )}
              </Field>
            </Row>

            <Row>
              <Field label={t("operatorCta_organization", "Organization")}>
                <input style={fieldStyle} value={organizationName} onChange={e => setOrganizationName(e.target.value)} placeholder="e.g. Las Clementinas" />
              </Field>
              <Field label={t("operatorCta_phone", "Phone")}>
                <input style={fieldStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+507 6200 0000" />
              </Field>
            </Row>

            <Row>
              <Field label={t("operatorCta_email", "Email *")}>
                <input style={fieldStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="operator@example.com" />
              </Field>
              <Field label={t("operatorCta_whatsapp", "WhatsApp")}>
                <input style={fieldStyle} type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="optional" />
              </Field>
            </Row>

            {/* Email collision banner — always visible (not gated on createLogin). */}
            {email.trim() && (
              <div style={{ marginTop: 4, marginBottom: 14, fontSize: 12 }}>
                {emailCheck.status === "checking" && (
                  <span style={{ color: "#7d7269", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Loader2 size={12} className="spin" /> {t("operatorCta_emailChecking", "Checking email…")}
                  </span>
                )}
                {emailCheck.status === "ok" && (
                  <span style={{ color: "#15803d" }}>✓ {t("operatorCta_emailAvailable", "Email available")}</span>
                )}
                {emailCheck.status === "exists" && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ color: "#92400e", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <AlertTriangle size={12} />
                      {t("operatorCta_emailExists", "A user with this email already exists.")}
                      {emailCheck.name ? ` (${emailCheck.name})` : ""}
                    </div>
                    {linkExistingUserId === emailCheck.userId ? (
                      <div style={{ color: "#15803d", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        ✓ {t("operatorCta_emailLinked", "Existing user will be linked to this operator.")}
                        <button
                          type="button"
                          onClick={() => setLinkExistingUserId(null)}
                          style={{ background: "none", border: "none", color: "#7d7269", textDecoration: "underline", cursor: "pointer", fontSize: 12 }}
                        >
                          {t("operatorCta_undo", "undo")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setLinkExistingUserId(emailCheck.userId);
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#fff", border: "1px solid #fde68a", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#92400e", fontWeight: 600 }}
                      >
                        <Link2 size={12} /> {t("operatorCta_linkExisting", "Link existing user instead")}
                      </button>
                    )}
                  </div>
                )}
                {emailCheck.status === "error" && <span style={{ color: "#b45309" }}>{emailCheck.error}</span>}
              </div>
            )}

            <div style={{ background: "#faf8f6", border: "1px solid #e8e2dd", borderRadius: 12, padding: "14px 16px", margin: "14px 0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7d7269", marginBottom: 12 }}>
                {t("operatorCta_compensationSection", "Compensation")}
              </div>
              <Field label={t("operatorCta_compensationMode", "Mode")}>
                <select style={fieldStyle} value={compMode} onChange={e => setCompMode(e.target.value)}>
                  {COMP_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              {compMeta.needsRate && (
                <div style={{ marginTop: 12 }}>
                  <Field label={t("operatorCta_ratePct", "Rate (%)")}>
                    <input style={fieldStyle} type="number" min="0" max="100" step="0.1" value={ratePct} onChange={e => setRatePct(e.target.value)} />
                  </Field>
                </div>
              )}
              {compMeta.needsFlat && (
                <div style={{ marginTop: 12 }}>
                  <Field label={t("operatorCta_flatAmount", "Flat amount (USD)")}>
                    <input style={fieldStyle} type="number" min="0" step="0.01" value={flatDollars} onChange={e => setFlatDollars(e.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "12px 14px", marginBottom: 18, fontSize: 12, color: "#7d7269" }}>
              {linkExistingUserId
                ? t("operatorCta_loginNoteLinked", "The existing user account with this email will be linked to this operator.")
                : t("operatorCta_loginNoteAlways", "A platform login (REFERRER role) will be created from the email above. Every operator is anchored to a user account.")}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={cancelBtnStyle}>{t("operatorCta_cancel", "Cancel")}</button>
              <button
                onClick={() => setStep("confirm")}
                disabled={!formValid}
                style={{ ...primaryBtnStyle, opacity: formValid ? 1 : 0.5, cursor: formValid ? "pointer" : "not-allowed" }}
              >
                {t("operatorCta_review", "Review")}
              </button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div>
            <div style={{ background: "#faf8f6", border: "1px solid #e8e2dd", borderRadius: 12, padding: "16px 18px", marginBottom: 14, fontSize: 14, lineHeight: 1.55, color: "#1a1614" }}>
              {confirmationText}
            </div>

            <p style={{ fontSize: 12, color: "#7d7269", margin: "0 0 16px" }}>
              {t("operatorCta_confirmChoiceHint", "Choose Confirm & Activate to fully onboard now, or Create user only to invite them and finish the operator setup later.")}
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
              <button
                onClick={() => setStep("form")}
                disabled={submitting !== null}
                style={{ ...cancelBtnStyle, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <ChevronLeft size={14} /> {t("operatorCta_back", "Back")}
              </button>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={onClose} disabled={submitting !== null} style={cancelBtnStyle}>
                  {t("operatorCta_cancel", "Cancel")}
                </button>
                <button
                  onClick={() => submit("userOnly")}
                  disabled={submitting !== null || !!linkExistingUserId}
                  title={linkExistingUserId ? t("operatorCta_userOnlyDisabledLinked", "Not available when linking an existing user.") : ""}
                  style={{
                    ...secondaryBtnStyle,
                    opacity: submitting !== null || linkExistingUserId ? 0.5 : 1,
                    cursor: submitting !== null || linkExistingUserId ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting === "userOnly"
                    ? t("operatorCta_creating", "Creating…")
                    : t("operatorCta_confirmUserOnly", "Create user only — don't activate yet")}
                </button>
                <button
                  onClick={() => submit("activate")}
                  disabled={submitting !== null}
                  style={{ ...primaryBtnStyle, opacity: submitting !== null ? 0.6 : 1, cursor: submitting !== null ? "not-allowed" : "pointer" }}
                >
                  {submitting === "activate"
                    ? t("operatorCta_creating", "Creating…")
                    : t("operatorCta_confirmActivate", "Confirm & Activate")}
                </button>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

const cancelBtnStyle: React.CSSProperties = {
  padding: "10px 18px", background: "#faf8f6", border: "1px solid #e8e2dd",
  borderRadius: 8, cursor: "pointer", fontSize: 14,
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: "10px 18px", background: "#fff", color: "#1a1614",
  border: "1px solid #1a1614", borderRadius: 8, fontSize: 14, fontWeight: 600,
};
const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 22px", background: "#1a1614", color: "#fff", border: "none",
  borderRadius: 8, fontSize: 14, fontWeight: 700,
};
