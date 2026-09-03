"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { useLocale, useTranslation } from "@/components/i18n/LocaleProvider";
import { useEffect, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

type Persona = {
  email: string;
  label: string;
  person?: string;
  descKey: string;
  color: string;
  tag: string;
  destination: string;
};

const EMPLOYEE_PERSONAS = [
  { email: "admin@oku.local",       label: "Superadmin",             descKey: "personaSuperadminDesc",        color: "#c41e3a", tag: "SUPERADMIN",  destination: "/admin" },
  { email: "commercial@oku.local",  label: "F&B Director",           person: "Carlos Mendez", descKey: "personaFBDirectorDesc",        color: "#7c3aed", tag: "F&B DIR",      destination: "/admin" },
  { email: "hr@oku.local",          label: "Admin HR",               descKey: "personaAdminHRDesc",           color: "#059669", tag: "ADMIN",        destination: "/admin/hr" },
  { email: "ir@oku.local",          label: "Admin IR",               descKey: "personaAdminIRDesc",           color: "#1d4ed8", tag: "ADMIN",        destination: "/admin/ir" },
  { email: "staff1@oku.local",      label: "Staff (OKÜ)",            descKey: "personaStaffDesc",             color: "#64748b", tag: "STAFF",        destination: "/staff" },
  { email: "host1@oku.local",       label: "Restaurant Supervisor",  person: "Rafael Núñez", descKey: "personaRestaurantSupervisorDesc", color: "#c8a96e", tag: "SUPERVISOR",  destination: "/host/dashboard" },
  { email: "sidehost@oku.local",    label: "Streetside Host",        person: "Diego Rivera", descKey: "personaStreetsideHostDesc",    color: "#a78bfa", tag: "STREETSIDE",   destination: "/host/streetside" },
] satisfies Persona[];

const EXTERNAL_PERSONAS = [
  { email: "influencer@oku.local",  label: "Influencer",          descKey: "personaInfluencerDesc",        color: "#c41e3a", tag: "CREATOR",      destination: "/influencer/dashboard" },
  { email: "partner@oku.local",     label: "Partner",             descKey: "personaPartnerDesc",           color: "#d97706", tag: "PARTNER",      destination: "/partner/dashboard" },
  { email: "investor@oku.local",    label: "Investor",            descKey: "personaInvestorDesc",          color: "#0891b2", tag: "INVESTOR",     destination: "/investor" },
  { email: "carlos@oku.local",      label: "Carlos Mendez",       descKey: "personaReferrerStreetDesc",    color: "#854d0e", tag: "REFERRER",     destination: "/referrer/dashboard" },
  { email: "taxi@oku.local",        label: "Taxi Juan",           descKey: "personaReferrerTaxiDesc",      color: "#1e3a5f", tag: "REFERRER",     destination: "/referrer/dashboard" },
  { email: "sophie@oku.local",      label: "Sophie Chen",         descKey: "personaReferrerHotelDesc",     color: "#4c1d6b", tag: "REFERRER",     destination: "/referrer/dashboard" },
  { email: "panama@oku.local",      label: "Panama City Tours",   descKey: "personaReferrerTourDesc",      color: "#065f46", tag: "REFERRER",     destination: "/referrer/dashboard" },
  { email: "attendee@oku.local",    label: "Attendee",            descKey: "personaAttendeeDesc",          color: "#c41e3a", tag: "GUEST",        destination: "/experiences" },
] satisfies Persona[];

export function LoginContent({ demoEnabled = false, googleEnabled = false }: { demoEnabled?: boolean; googleEnabled?: boolean }) {
  const t = useTranslation();
  const locale = useLocale();
  const [isInIframe, setIsInIframe] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const authError = searchParams.get("error");
  const [passwordlessEmail, setPasswordlessEmail] = useState("");
  const [passwordlessSent, setPasswordlessSent] = useState(false);
  const [passwordlessError, setPasswordlessError] = useState("");
  const [passwordlessLoading, setPasswordlessLoading] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  const buildLoginUrl = (email: string, destination: string) => {
    const params = new URLSearchParams({ email, callbackUrl: destination });
    return `/api/auth/demo-login?${params.toString()}`;
  };

  const handleLoginClick = (event: MouseEvent<HTMLAnchorElement>, email: string, destination: string) => {
    if (!isInIframe) return;

    event.preventDefault();
    const url = buildLoginUrl(email, destination);
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) {
      window.location.href = url;
    }
  };

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordlessLoading(true);
    setPasswordlessError("");
    try {
      const response = await fetch("/api/auth/passwordless/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: passwordlessEmail, callbackUrl, locale, _company: "" }),
      });
      if (!response.ok && response.status !== 429) throw new Error("request failed");
      setPasswordlessSent(true);
    } catch {
      setPasswordlessError(t("auth", "magicLinkRequestError"));
    } finally {
      setPasswordlessLoading(false);
    }
  }

  const PersonaCard = ({ p }: { p: Persona }) => {
    const href = buildLoginUrl(p.email, p.destination);
    return (
    <a
      key={p.email}
      href={href}
      onClick={(event) => handleLoginClick(event, p.email, p.destination)}
      className="persona-card-affordance"
      aria-label={`Sign in as ${p.label}${p.person ? `, ${p.person}` : ""}`}
    >
      <div className="accent-bar" style={{ background: p.color }} />
      <div style={{ flex: 1, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}>
            {p.label}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "3px 8px", borderRadius: 999, flexShrink: 0,
            background: p.tag === "SUPERADMIN" ? "rgba(196,30,58,0.2)" : "rgba(255,255,255,0.1)",
            color: p.tag === "SUPERADMIN" ? "#ff8a9f" : "rgba(255,255,255,0.85)",
          }}>
            {p.tag}
          </span>
        </div>
        <span style={{ fontSize: 13, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.person ? `${p.person} · ` : ""}{t("auth", p.descKey)}
        </span>
      </div>
      <div style={{ padding: "0 16px 0 8px" }}>
        {isInIframe
          ? <ExternalLink size={18} className="pca-chevron" />
          : <ChevronRight size={20} className="pca-chevron" />
        }
      </div>
    </a>
    );
  };

  const SectionLabel = ({ text }: { text: string }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, margin: "8px 0 10px",
    }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5a5a5a", whiteSpace: "nowrap" }}>
        {text}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
    </div>
  );

  // When demo mode is disabled (production / staging without DEMO_MODE_ENABLED=true)
  // render a minimal sign-in placeholder instead of the persona grid. The
  // demo-login API route is also fail-closed in this case, so even if a
  // persona button were rendered the request would 403.
  if (!demoEnabled) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#1a1614", justifyContent: "center", alignItems: "center", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(28px, 7vw, 36px)",
            fontWeight: 600, color: "white",
            letterSpacing: "-0.02em",
            margin: "0 0 16px 0", lineHeight: 1.1,
          }}>
            {t("auth", "signIn")}
          </h1>
          {authError && (
            <p role="alert" style={{ fontSize: 14, color: "#ff8a9f", lineHeight: 1.6, margin: "0 0 20px 0" }}>
              {t("auth", "accessDenied")}
            </p>
          )}
          <form onSubmit={requestMagicLink} style={{ textAlign: "left" }}>
            <label htmlFor="passwordless-email" style={{ display: "block", color: "#d1d5db", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {t("auth", "email")}
            </label>
            <input
              id="passwordless-email"
              type="email"
              autoComplete="email"
              required
              value={passwordlessEmail}
              onChange={(event) => {
                setPasswordlessEmail(event.target.value);
                setPasswordlessSent(false);
              }}
              placeholder={t("auth", "magicLinkEmailPlaceholder")}
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: "#fff", color: "#1a1614", fontSize: 16 }}
            />
            <button
              type="submit"
              disabled={passwordlessLoading}
              style={{ width: "100%", marginTop: 12, padding: "13px 18px", borderRadius: 10, border: 0, background: "#c41e3a", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: passwordlessLoading ? .7 : 1 }}
            >
              {passwordlessLoading ? t("auth", "magicLinkSending") : t("auth", "magicLinkSend")}
            </button>
            {passwordlessSent ? (
              <p role="status" style={{ color: "#9ae6b4", fontSize: 14, lineHeight: 1.6 }}>
                {t("auth", "magicLinkGenericSuccess")}
              </p>
            ) : null}
            {passwordlessError ? (
              <p role="alert" style={{ color: "#ff8a9f", fontSize: 14 }}>{passwordlessError}</p>
            ) : null}
          </form>
          {googleEnabled ? (
            <>
              <div style={{ margin: "22px 0", color: "#6b7280", fontSize: 13 }}>{t("auth", "or")}</div>
              <button
                type="button"
                onClick={() => void signIn("google", { callbackUrl })}
                style={{
                  width: "100%", padding: "13px 18px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.2)", background: "white",
                  color: "#1a1614", fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}
              >
                {t("auth", "continueWith")} Google
              </button>
              <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: "18px 0 0" }}>
                {t("auth", "googleApprovedAccount")}
              </p>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#1a1614" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        padding: "48px 24px 24px",
        background: "rgba(26,22,20,0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <h1 style={{
          fontFamily: "var(--font-heading)",
          fontSize: "clamp(28px, 7vw, 36px)",
          fontWeight: 600, color: "white",
          letterSpacing: "-0.02em",
          margin: "0 0 8px 0", lineHeight: 1.1,
        }}>
          {t("auth", "demoSignInAs")}
        </h1>
        <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6, margin: 0 }}>
          {t("auth", "demoSelectPersona")}
        </p>
      </header>

      {isInIframe && (
        <div style={{
          margin: "16px 16px 0", padding: "14px 16px",
          background: "rgba(196,30,58,0.12)", border: "1px solid rgba(196,30,58,0.35)",
          borderRadius: 10, display: "flex", alignItems: "flex-start", gap: 12,
          maxWidth: 560, alignSelf: "center", width: "calc(100% - 32px)",
        }}>
          <ExternalLink size={18} style={{ color: "#ff8a9f", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#ff8a9f", margin: "0 0 3px 0" }}>
              Preview mode — authentication requires a new tab
            </p>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, lineHeight: 1.5 }}>
              Browsers block login cookies in embedded previews. Clicking a persona below will open a new tab where login works normally.
            </p>
          </div>
        </div>
      )}

      <main style={{ flex: 1, overflowY: "auto", padding: "24px 16px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560, margin: "0 auto" }}>

          <SectionLabel text="OKÜ Team — Positions We Hire" />
          {EMPLOYEE_PERSONAS.map((p) => <PersonaCard key={p.email} p={p} />)}

          <div style={{ margin: "8px 0" }} />
          <SectionLabel text="External — Partners & Guests" />
          {EXTERNAL_PERSONAS.map((p) => <PersonaCard key={p.email} p={p} />)}

        </div>
      </main>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        height: 48,
        background: "linear-gradient(to top, #1a1614, transparent)",
        pointerEvents: "none", zIndex: 10,
      }} />
    </div>
  );
}
