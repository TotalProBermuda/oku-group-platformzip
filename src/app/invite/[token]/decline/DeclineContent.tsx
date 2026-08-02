"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

export function DeclineContent() {
  const t = useTranslation();
  const locale = useLocale();
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "declined" | "error">("loading");
  const [seriesTitle, setSeriesTitle] = useState("");

  useEffect(() => {
    fetch(`/api/v1/invitations/${token}/decline`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStatus("declined");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));

    fetch(`/api/v1/invitations/${token}`)
      .then((r) => r.json())
      .then((d) => { if (d.series?.title) setSeriesTitle(d.series.title); })
      .catch(() => {});
  }, [token]);

  return (
    <>
      <div style={{ minHeight: "100vh", background: "#f5f0ea" }}>
        <div style={{ background: "#1a1614", padding: "20px 32px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#c41e3a", fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>OKÜ</span>
          <span style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" }}>HOSPITALITY GROUP</span>
        </div>

        <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 48 }}>
            {status === "loading" && (
              <div style={{ width: 40, height: 40, border: "3px solid #c41e3a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
            )}
            {status === "declined" && (
              <>
                <div style={{ fontSize: 48, marginBottom: 16 }}>◇</div>
                <h2 style={{ color: "#1a1614", fontSize: 22, fontFamily: "Georgia, serif", marginBottom: 12 }}>
                  {t("events", "invitationDeclinedTitle")}
                </h2>
                <p style={{ color: "#7c7168", fontSize: 15, marginBottom: 8 }}>
                  {seriesTitle
                    ? t("events", "invitationDeclinedMsg", { title: seriesTitle })
                    : t("events", "invitationDeclinedGeneric")}
                </p>
                <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 28 }}>
                  {t("events", "futureEventHope")}
                </p>
                <Link href={`/${locale}`} style={{ display: "inline-block", background: "#1a1614", color: "#fff", padding: "12px 28px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
                  {t("events", "returnToOkuLabel")}
                </Link>
              </>
            )}
            {status === "error" && (
              <>
                <div style={{ fontSize: 48, marginBottom: 16 }}>◇</div>
                <h2 style={{ color: "#1a1614", fontSize: 22, fontFamily: "Georgia, serif", marginBottom: 12 }}>{t("events", "linkUnavailableTitle")}</h2>
                <p style={{ color: "#7c7168", fontSize: 15 }}>{t("events", "inviteLinkInvalid")}</p>
                <Link href={`/${locale}`} style={{ display: "inline-block", marginTop: 24, color: "#c41e3a", fontSize: 14 }}>{t("events", "returnToOku")}</Link>
              </>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
