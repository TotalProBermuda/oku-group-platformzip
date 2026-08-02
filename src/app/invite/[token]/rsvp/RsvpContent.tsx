"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

interface InviteData {
  invitation: {
    id: string;
    status: string;
    recipientName: string | null;
  };
  series: {
    id: string;
    slug: string;
    title: string;
    startsAt: string | null;
    venueAddress: string | null;
    city: string | null;
    description: string | null;
    heroImageUrl: string | null;
    inviteFlyerImageUrl: string | null;
    inviteRequiresRegistration: boolean;
    minMembershipTier: string | null;
  };
}

export function RsvpContent() {
  const t = useTranslation();
  const locale = useLocale();
  const { token } = useParams<{ token: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function formatDate(d: string | null) {
    if (!d) return t("events", "dateTbd");
    return new Intl.DateTimeFormat(locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    }).format(new Date(d));
  }

  useEffect(() => {
    fetch(`/api/v1/invitations/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); }
        else { setData(d); }
        setLoading(false);
      })
      .catch(() => { setError("LOAD_ERROR"); setLoading(false); });
  }, [token]);

  async function handleRsvpStart() {
    if (!session) {
      router.push(`/login?callbackUrl=/invite/${token}/rsvp`);
      return;
    }
    setConfirming(true);
    const res = await fetch(`/api/v1/invitations/${token}/rsvp-start`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed"); setConfirming(false); return; }

    if (!data?.series.inviteRequiresRegistration) {
      const confirmRes = await fetch(`/api/v1/invitations/${token}/confirm-free`, { method: "POST" });
      if (confirmRes.ok) { setConfirmed(true); setConfirming(false); return; }
    }

    router.push(`/${locale}/experiences/${data?.series.slug}?rsvp=1&inv=${json.invitationId}`);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f0ea", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #c41e3a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f0ea", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 48, maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>◇</div>
          <h2 style={{ color: "#1a1614", fontSize: 22, fontFamily: "Georgia, serif", marginBottom: 12 }}>{t("events", "inviteUnavailable")}</h2>
          <p style={{ color: "#7c7168", fontSize: 15 }}>
            {error === "DECLINED" ? t("events", "inviteAlreadyDeclined") : t("events", "inviteLinkInvalid")}
          </p>
          <Link href={`/${locale}`} style={{ display: "inline-block", marginTop: 24, color: "#c41e3a", fontSize: 14 }}>{t("events", "returnToOku")}</Link>
        </div>
      </div>
    );
  }

  if (confirmed || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f0ea", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 48, maxWidth: 480, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, background: "#c41e3a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", color: "#fff", fontSize: 28 }}>✓</div>
          <h2 style={{ color: "#1a1614", fontSize: 24, fontFamily: "Georgia, serif", marginBottom: 12 }}>{t("events", "rsvpConfirmedTitle")}</h2>
          <p style={{ color: "#7c7168", fontSize: 15, marginBottom: 24 }}>
            {t("events", "rsvpConfirmedBody", { title: data?.series.title ?? "" })}
          </p>
          <Link href={`/${locale}/experiences/${data?.series.slug}`} style={{ display: "inline-block", background: "#c41e3a", color: "#fff", padding: "12px 28px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
            {t("events", "viewEvent")}
          </Link>
        </div>
      </div>
    );
  }

  const { series } = data;
  const flyerUrl = series.inviteFlyerImageUrl ?? series.heroImageUrl;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ minHeight: "100vh", background: "#f5f0ea" }}>
        <div style={{ background: "#1a1614", padding: "20px 32px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#c41e3a", fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>OKÜ</span>
          <span style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" }}>HOSPITALITY GROUP</span>
        </div>

        <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden" }}>
            {flyerUrl && (
              <img src={flyerUrl} alt={series.title} style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "cover" }} />
            )}
            <div style={{ padding: "36px 36px 40px" }}>
              <p style={{ margin: "0 0 8px", color: "#7c7168", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em" }}>{t("events", "youAreInvited")}</p>
              <h1 style={{ margin: "0 0 24px", color: "#1a1614", fontSize: 28, fontFamily: "Georgia, serif", lineHeight: 1.2 }}>{series.title}</h1>

              <div style={{ background: "#f9f7f4", borderRadius: 8, padding: 20, marginBottom: 28 }}>
                <p style={{ margin: "0 0 4px", color: "#7c7168", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("events", "dateAndTime")}</p>
                <p style={{ margin: "0 0 16px", color: "#1a1614", fontSize: 15 }}>{formatDate(series.startsAt)}</p>
                {(series.venueAddress || series.city) && (
                  <>
                    <p style={{ margin: "16px 0 4px", color: "#7c7168", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", borderTop: "1px solid #e8e3db", paddingTop: 16 }}>{t("events", "venue")}</p>
                    <p style={{ margin: 0, color: "#1a1614", fontSize: 15 }}>{[series.venueAddress, series.city].filter(Boolean).join(", ")}</p>
                  </>
                )}
              </div>

              {series.description && (
                <p style={{ margin: "0 0 32px", color: "#4b4540", fontSize: 15, lineHeight: 1.7 }}>{series.description}</p>
              )}

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={handleRsvpStart}
                  disabled={confirming}
                  style={{ flex: 1, background: "#c41e3a", color: "#fff", border: "none", borderRadius: 8, padding: "15px 0", fontSize: 15, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  {confirming ? t("events", "rsvpProcessing") : t("events", "rsvp")}
                </button>
                <Link
                  href={`/invite/${token}/decline`}
                  style={{ flex: 1, background: "#f5f0ea", color: "#7c7168", border: "1px solid #e8e3db", borderRadius: 8, padding: "15px 0", fontSize: 15, fontWeight: 600, textDecoration: "none", textAlign: "center", display: "block" }}
                >
                  {t("events", "declineButton")}
                </Link>
              </div>

              {status === "unauthenticated" && (
                <p style={{ margin: "16px 0 0", color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
                  {t("events", "signInForRsvp")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
