"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import FounderApplicationModal from "./FounderApplicationModal";
import PatronCheckoutModal from "./PatronCheckoutModal";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface Plan {
  tier: string;
  displayName: string;
  tagline: string;
  priceAnnualCents: number;
  currency: string;
  avacaContributionBps: number;
  isInviteOnly: boolean;
  maxActiveMembers: number | null;
  benefitsJson: any;
}

interface Props {
  plans: Plan[];
  isLoggedIn: boolean;
}

export default function MembershipPageClient({ plans, isLoggedIn }: Props) {
  const t = useTranslation();
  const [showFounderModal, setShowFounderModal] = useState(false);
  const [showPatronModal, setShowPatronModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const router = useRouter();

  const PATRON_BENEFITS = [
    t("common", "patronBenefit1"),
    t("common", "patronBenefit2"),
    t("common", "patronBenefit3"),
    t("common", "patronBenefit4"),
    t("common", "patronBenefit5"),
    t("common", "patronBenefit6"),
    t("common", "patronBenefit7"),
  ];

  const FOUNDER_BENEFITS = [
    t("common", "founderBenefit1"),
    t("common", "founderBenefit2"),
    t("common", "founderBenefit3"),
    t("common", "founderBenefit4"),
    t("common", "founderBenefit5"),
    t("common", "founderBenefit6"),
    t("common", "founderBenefit7"),
    t("common", "founderBenefit8"),
    t("common", "founderBenefit9"),
  ];

  const FAQ = [
    { q: t("common", "faqQ1"), a: t("common", "faqA1") },
    { q: t("common", "faqQ2"), a: t("common", "faqA2") },
    { q: t("common", "faqQ3"), a: t("common", "faqA3") },
    { q: t("common", "faqQ4"), a: t("common", "faqA4") },
    { q: t("common", "faqQ5"), a: t("common", "faqA5") },
    { q: t("common", "faqQ6"), a: t("common", "faqA6") },
  ];

  const patronPersonas = [
    t("common", "patronPersona1"),
    t("common", "patronPersona2"),
    t("common", "patronPersona3"),
    t("common", "patronPersona4"),
    t("common", "patronPersona5"),
  ];

  const founderPersonas = [
    t("common", "founderPersona1"),
    t("common", "founderPersona2"),
    t("common", "founderPersona3"),
    t("common", "founderPersona4"),
    t("common", "founderPersona5"),
  ];

  function handleJoinPatron() {
    if (!isLoggedIn) {
      router.push("/login?callbackUrl=/membership");
      return;
    }
    setShowPatronModal(true);
  }

  const patron = plans.find((p) => p.tier === "PATRON");
  const founder = plans.find((p) => p.tier === "FOUNDER");

  const avacaPct = Math.round((patron?.avacaContributionBps ?? 1500) / 100);
  const patronAnnual = patron ? `$${(patron.priceAnnualCents / 100).toLocaleString()}` : "$2,500";

  return (
    <main style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      {showFounderModal && <FounderApplicationModal onClose={() => setShowFounderModal(false)} />}
      {showPatronModal && (
        <PatronCheckoutModal
          onClose={() => setShowPatronModal(false)}
          patronAnnual={patronAnnual}
          avacaPct={avacaPct}
        />
      )}

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{
        background: "#0e0c0b",
        color: "#f5f1ee",
        padding: "100px 24px 80px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ display: "inline-block", background: "rgba(196,30,58,0.15)", border: "1px solid rgba(196,30,58,0.35)", color: "#e07080", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", padding: "5px 14px", borderRadius: 4, marginBottom: 28 }}>
            OKÜ MEMBERSHIP
          </div>
          <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "clamp(36px, 5vw, 58px)", fontWeight: 400, lineHeight: 1.15, marginBottom: 24, letterSpacing: "-0.01em" }}>
            {t("common", "heroTitle")}
          </h1>
          <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "#9e9690", lineHeight: 1.7, marginBottom: 40, maxWidth: 520, margin: "0 auto 40px" }}>
            {t("common", "heroDesc")}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={handleJoinPatron} style={{ background: "var(--color-primary)", color: "#fff", padding: "14px 28px", borderRadius: 6, fontWeight: 600, fontSize: 15, border: "none", cursor: "pointer", letterSpacing: "0.04em" }}>
              {t("common", "joinPatronCta").replace("{price}", patronAnnual)}
            </button>
            <button onClick={() => setShowFounderModal(true)}
              style={{ background: "rgba(255,255,255,0.08)", color: "#e8d5a3", border: "1px solid rgba(232,213,163,0.35)", padding: "14px 28px", borderRadius: 6, fontWeight: 600, fontSize: 15, cursor: "pointer", letterSpacing: "0.04em" }}>
              {t("common", "requestFounderAccess")}
            </button>
          </div>
        </div>
      </section>

      {/* ── AVACA BANNER ──────────────────────────────────────────────────── */}
      <div style={{ background: "var(--color-primary)", padding: "18px 24px" }}>
        <p style={{ textAlign: "center", color: "#fff", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          {t("common", "avacaBannerText").replace("{pct}", String(avacaPct))}
        </p>
      </div>

      {/* ── TIERS ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 24px", maxWidth: 1040, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 32, textAlign: "center", marginBottom: 12, fontWeight: 400 }}>
          {t("common", "tierSectionTitle")}
        </h2>
        <p style={{ textAlign: "center", color: "var(--color-text-secondary)", marginBottom: 56, maxWidth: 480, margin: "0 auto 56px" }}>
          {t("common", "tierSectionDesc")}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          {/* PATRON */}
          <div id="patron" style={{ border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden", background: "var(--color-surface)" }}>
            <div style={{ background: "var(--color-primary)", padding: "28px 32px" }}>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", marginBottom: 8 }}>{t("common", "patronTierLabel")}</div>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#fff", fontWeight: 400, margin: "0 0 6px" }}>Patron</h3>
              <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, margin: "0 0 20px", lineHeight: 1.5 }}>{t("common", "patronTierTagline")}</p>
              <div style={{ color: "#fff" }}>
                <span style={{ fontFamily: "Georgia, serif", fontSize: 36, fontWeight: 400 }}>{patronAnnual}</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginLeft: 6 }}>{t("common", "perYear")}</span>
              </div>
            </div>
            <div style={{ padding: "28px 32px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", letterSpacing: "0.12em", marginBottom: 18 }}>{t("common", "yourAccessLabel")}</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 11 }}>
                {PATRON_BENEFITS.map((b) => (
                  <li key={b} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--color-text)", lineHeight: 1.5 }}>
                    <span style={{ color: "var(--color-primary)", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>—</span>
                    {b}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
                  {t("common", "supportsCascoNote").replace("{pct}", String(avacaPct))}
                </div>
                <button onClick={handleJoinPatron} className="btn btn-primary" style={{ display: "block", width: "100%", textAlign: "center", padding: "13px", border: "none", borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                  {t("common", "joinPatron")}
                </button>
              </div>
            </div>
          </div>

          {/* FOUNDER */}
          <div id="founder" style={{ border: "1px solid #2a2622", borderRadius: 12, overflow: "hidden", background: "#1a1614" }}>
            <div style={{ background: "#0e0c0b", padding: "28px 32px", borderBottom: "1px solid #2a2622" }}>
              <div style={{ color: "rgba(232,213,163,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", marginBottom: 8 }}>{t("common", "founderTierLabel")}</div>
              <h3 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#e8d5a3", fontWeight: 400, margin: "0 0 6px" }}>Founder</h3>
              <p style={{ color: "rgba(232,213,163,0.65)", fontSize: 14, margin: "0 0 20px", lineHeight: 1.5 }}>{t("common", "founderTierTagline")}</p>
              <div>
                <span style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 400, color: "#e8d5a3" }}>{t("common", "byInvitationOnly")}</span>
              </div>
              {founder?.maxActiveMembers && (
                <div style={{ marginTop: 10, fontSize: 12, color: "rgba(232,213,163,0.5)", letterSpacing: "0.06em" }}>
                  {t("common", "limitedToMembers").replace("{n}", String(founder.maxActiveMembers))}
                </div>
              )}
            </div>
            <div style={{ padding: "28px 32px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(232,213,163,0.5)", letterSpacing: "0.12em", marginBottom: 18 }}>{t("common", "yourAccessLabel")}</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 11 }}>
                {FOUNDER_BENEFITS.map((b) => (
                  <li key={b} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#c8bfb6", lineHeight: 1.5 }}>
                    <span style={{ color: "#e8d5a3", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>—</span>
                    {b}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #2a2622" }}>
                <div style={{ fontSize: 12, color: "rgba(232,213,163,0.4)", marginBottom: 14, lineHeight: 1.5 }}>
                  {t("common", "shapesCascoNote").replace("{pct}", String(avacaPct))}
                </div>
                <button onClick={() => setShowFounderModal(true)}
                  style={{ display: "block", width: "100%", background: "rgba(232,213,163,0.1)", color: "#e8d5a3", border: "1px solid rgba(232,213,163,0.3)", borderRadius: 6, padding: "13px", fontSize: 15, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em" }}>
                  {t("common", "requestFounderAccess")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AVACA SECTION ─────────────────────────────────────────────────── */}
      <section style={{ background: "#f5f0eb", padding: "72px 24px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <div style={{ position: "relative", width: 120, height: 80 }}>
              <Image
                src="/images/avaca-logo.jpg"
                alt="AVACA — Asociación de Vecinos y Amigos del Casco Antiguo"
                fill
                style={{ objectFit: "contain" }}
              />
            </div>
          </div>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 400, marginBottom: 20, lineHeight: 1.3 }}>
            {t("common", "avacaSectionTitle")}
          </h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 16, lineHeight: 1.75, marginBottom: 12 }}>
            {t("common", "avacaSectionDesc1").replace("{pct}", String(avacaPct))}
          </p>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 15, lineHeight: 1.75 }}>
            {t("common", "avacaSectionDesc2")}
          </p>
        </div>
      </section>

      {/* ── FOR WHOM ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "72px 24px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 30, textAlign: "center", marginBottom: 12, fontWeight: 400 }}>
          {t("common", "whoJoinsTitle")}
        </h2>
        <p style={{ textAlign: "center", color: "var(--color-text-secondary)", marginBottom: 56, maxWidth: 460, margin: "0 auto 56px" }}>
          {t("common", "whoJoinsDesc")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
          {[
            { label: t("common", "tierOneLabel"), title: "Patron", accent: "#c41e3a", items: patronPersonas },
            { label: t("common", "tierTwoLabel"), title: "Founder", accent: "#b8973a", items: founderPersonas },
          ].map((col) => (
            <div key={col.title} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "28px 24px" }}>
              <div style={{ width: 32, height: 3, background: col.accent, borderRadius: 2, marginBottom: 16 }} />
              <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.14em" }}>{col.label}</p>
              <div style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 20, marginBottom: 18, color: "var(--color-text)" }}>{col.title}</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {col.items.map((i) => (
                  <li key={i} style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5, paddingLeft: 12, borderLeft: `2px solid ${col.accent}22` }}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--color-surface)", padding: "72px 24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 30, textAlign: "center", marginBottom: 48, fontWeight: 400 }}>
            {t("common", "faqTitle")}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", gap: 16 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)", lineHeight: 1.4 }}>{item.q}</span>
                  <span style={{ color: "var(--color-text-muted)", fontSize: 20, flexShrink: 0 }}>{openFaq === i ? "−" : "+"}</span>
                </button>
                {openFaq === i && (
                  <div style={{ paddingBottom: 20 }}>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--color-border)" }} />
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ────────────────────────────────────────────────────── */}
      <section style={{ background: "#0e0c0b", padding: "72px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 32, color: "#f5f1ee", fontWeight: 400, marginBottom: 16, lineHeight: 1.25 }}>
            {t("common", "readyToJoinTitle")}
          </h2>
          <p style={{ color: "#9e9690", fontSize: 15, lineHeight: 1.7, marginBottom: 36 }}>
            {t("common", "readyToJoinDesc").replace("{price}", patronAnnual)}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={handleJoinPatron} style={{ background: "var(--color-primary)", color: "#fff", padding: "14px 28px", borderRadius: 6, fontWeight: 600, fontSize: 15, border: "none", cursor: "pointer", letterSpacing: "0.04em" }}>
              {t("common", "joinPatron")}
            </button>
            <button onClick={() => setShowFounderModal(true)}
              style={{ background: "rgba(255,255,255,0.08)", color: "#e8d5a3", border: "1px solid rgba(232,213,163,0.3)", padding: "14px 28px", borderRadius: 6, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              {t("common", "requestFounderAccess")}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
