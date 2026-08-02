"use client";
import Link from "next/link";

interface QuickAction {
  href: string;
  icon: string;
  label: string;
  desc: string;
}

interface Props {
  firstName: string;
  roleLabel: string;
  dashHref: string;
  quickActions: QuickAction[];
  welcomeBack: string;
  goToDashboard: string;
}

export default function MemberHero({ firstName, roleLabel, dashHref, quickActions, welcomeBack, goToDashboard }: Props) {
  return (
    <section style={{
      background: "linear-gradient(135deg, #1a1614 0%, #2d1f1b 60%, #1a1614 100%)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(ellipse at 70% 40%, rgba(200,169,110,0.07) 0%, transparent 60%)", pointerEvents: "none" }} />

      <div style={{ maxWidth: "var(--site-max-w)", margin: "0 auto", padding: "52px 24px 48px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 36 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c8a96e", marginBottom: 8 }}>
              {roleLabel}
            </div>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 400, color: "white", margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {welcomeBack}<br />{firstName}.
            </h1>
          </div>
          <Link
            href={dashHref}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 24px", borderRadius: 12,
              background: "var(--color-primary)", color: "white",
              fontWeight: 700, fontSize: 14, textDecoration: "none",
              letterSpacing: "0.02em", whiteSpace: "nowrap",
              boxShadow: "0 4px 20px rgba(200,169,110,0.25)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 16 }}>▤</span>
            {goToDashboard}
          </Link>
        </div>

        {quickActions.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {quickActions.map((item) => (
              <MemberCard key={item.label} {...item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MemberCard({ href, icon, label, desc }: QuickAction) {
  return (
    <Link
      href={href}
      className="member-quick-card"
      style={{
        display: "block", padding: "16px", borderRadius: 12,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        textDecoration: "none",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{desc}</div>
    </Link>
  );
}
