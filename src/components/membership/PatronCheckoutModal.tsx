"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface Props {
  onClose: () => void;
  patronAnnual: string;
  avacaPct: number;
}

type Stage = "confirm" | "loading" | "success" | "already_member" | "already_pending" | "error";

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(10,8,7,0.82)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, padding: 24,
};

const MODAL: React.CSSProperties = {
  background: "#fff", borderRadius: 14, width: "100%", maxWidth: 480,
  overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
};

export default function PatronCheckoutModal({ onClose, patronAnnual, avacaPct }: Props) {
  const t = useTranslation();
  const [stage, setStage] = useState<Stage>("confirm");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  const patronBenefits = [
    t("common", "patronBenefit1"),
    t("common", "patronBenefit2"),
    t("common", "patronBenefit3"),
    t("common", "patronBenefit4"),
    t("common", "patronBenefit5"),
  ];

  async function handleJoin() {
    setStage("loading");
    try {
      const res = await fetch("/api/v1/membership/patron/checkout-session", { method: "POST" });
      const data = await res.json();

      if (res.status === 409 && data.error === "ALREADY_MEMBER") {
        setStage("already_member");
        return;
      }
      if (res.status === 409 && data.error === "ALREADY_PENDING") {
        setStage("already_pending");
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error ?? t("common", "patronModalError"));
        setStage("error");
        return;
      }
      setStage("success");
    } catch {
      setErrorMsg(t("common", "networkErrorMsg"));
      setStage("error");
    }
  }

  return (
    <div style={OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL}>

        <div style={{ background: "#1a1614", padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ color: "#c41e3a", fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 700 }}>OKÜ</span>
            <span style={{ color: "#6b6560", fontSize: 11, letterSpacing: "0.16em", marginLeft: 8, textTransform: "uppercase" }}>{t("common", "membershipHeader")}</span>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common", "closeBtn")}
            style={{ background: "none", border: "none", color: "#6b6560", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}
          >
            ×
          </button>
        </div>

        {stage === "confirm" && (
          <div style={{ padding: "28px 28px 32px" }}>
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em" }}>{t("common", "tierOneLabel")}</p>
              <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia,serif", fontSize: 26, fontWeight: 400, color: "#1a1614" }}>{t("common", "patronModalTitle")}</h2>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                <span style={{ fontFamily: "Georgia,serif", fontSize: 32, color: "#1a1614", fontWeight: 400 }}>{patronAnnual}</span>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>{t("common", "perYear")}</span>
              </div>
            </div>

            <div style={{ background: "#f9f7f4", borderRadius: 8, padding: "16px 18px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("common", "yourAccess")}</p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {patronBenefits.map((b) => (
                  <li key={b} style={{ display: "flex", gap: 8, fontSize: 13, color: "#4b4540", lineHeight: 1.45 }}>
                    <span style={{ color: "#c41e3a", fontWeight: 700, flexShrink: 0 }}>—</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ background: "#faf5f0", border: "1px solid #e8d5c4", borderRadius: 8, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flexShrink: 0, width: 52, height: 52, position: "relative" }}>
                <Image src="/images/avaca-logo.jpg" alt="AVACA" fill style={{ objectFit: "contain" }} />
              </div>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: "#7c5c4a", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("common", "communityImpactLabel")}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#5c3d2e", lineHeight: 1.55 }}>
                  {t("common", "patronModalAvacaNote").replace("{pct}", String(avacaPct))}
                </p>
              </div>
            </div>

            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 24 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
                {t("common", "patronModalNote")}
              </p>
            </div>

            <button
              onClick={handleJoin}
              style={{
                width: "100%", background: "#c41e3a", color: "#fff",
                border: "none", borderRadius: 8, padding: "14px",
                fontSize: 15, fontWeight: 700, cursor: "pointer",
                letterSpacing: "0.04em", marginBottom: 12,
              }}
            >
              {t("common", "patronRegisterInterestCta").replace("{price}", patronAnnual)}
            </button>
            <button
              onClick={onClose}
              style={{ width: "100%", background: "none", border: "1px solid #e8e3db", borderRadius: 8, padding: "12px", fontSize: 14, color: "#7c7168", cursor: "pointer" }}
            >
              {t("common", "cancelBtn")}
            </button>
          </div>
        )}

        {stage === "loading" && (
          <div style={{ padding: "60px 28px", textAlign: "center" }}>
            <div style={{
              width: 40, height: 40, border: "3px solid #e8e3db", borderTopColor: "#c41e3a",
              borderRadius: "50%", margin: "0 auto 20px", animation: "spin 0.8s linear infinite",
            }} />
            <p style={{ color: "#7c7168", fontSize: 14, margin: 0 }}>{t("common", "registeringInterest")}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {stage === "success" && (
          <div style={{ padding: "36px 28px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 4, height: 48, background: "#16a34a", borderRadius: 2, flexShrink: 0 }} />
              <div>
                <h3 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 400, color: "#1a1614", margin: "0 0 4px" }}>{t("common", "patronModalSuccessTitle")}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>{t("common", "pendingTeamConfirmation")}</p>
              </div>
            </div>
            <p style={{ color: "#4b4540", fontSize: 14, lineHeight: 1.7, margin: "0 0 6px" }}>
              {t("common", "patronModalSuccessDesc1")}
            </p>
            <p style={{ color: "#7c7168", fontSize: 13, lineHeight: 1.7, margin: "0 0 24px" }}>
              {t("common", "patronModalSuccessDesc2")}
            </p>
            <div style={{ background: "#f9f7f4", borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{t("common", "enrolmentLabel")}</p>
              <p style={{ margin: "4px 0 0", fontSize: 14, color: "#1a1614", fontWeight: 500 }}>{t("common", "patronEnrolmentSummary").replace("{price}", patronAnnual)}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>{t("common", "pendingApprovalStatus")}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#faf5f0", border: "1px solid #e8d5c4", borderRadius: 8, padding: "10px 14px", marginBottom: 24 }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, position: "relative" }}>
                <Image src="/images/avaca-logo.jpg" alt="AVACA" fill style={{ objectFit: "contain" }} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#5c3d2e", lineHeight: 1.5 }}>
                {t("common", "avacaContributeNote")}
              </p>
            </div>
            <button
              onClick={() => { onClose(); router.push("/my/membership"); }}
              style={{ width: "100%", background: "#1a1614", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em" }}
            >
              {t("common", "viewMyMembership")}
            </button>
          </div>
        )}

        {stage === "already_member" && (
          <div style={{ padding: "36px 28px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 4, height: 48, background: "#c41e3a", borderRadius: 2, flexShrink: 0 }} />
              <div>
                <h3 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 400, color: "#1a1614", margin: "0 0 4px" }}>{t("common", "patronModalAlreadyMember")}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#c41e3a", fontWeight: 600 }}>{t("common", "activeMembership")}</p>
              </div>
            </div>
            <p style={{ color: "#7c7168", fontSize: 14, lineHeight: 1.7, margin: "0 0 28px" }}>
              {t("common", "alreadyMemberDesc")}
            </p>
            <button
              onClick={() => { onClose(); router.push("/my/membership"); }}
              style={{ width: "100%", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em", marginBottom: 10 }}
            >
              {t("common", "goToMyMembership")}
            </button>
            <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", fontSize: 13, color: "#9ca3af", cursor: "pointer", padding: "8px" }}>{t("common", "closeBtn")}</button>
          </div>
        )}

        {stage === "already_pending" && (
          <div style={{ padding: "36px 28px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 4, height: 48, background: "#f59e0b", borderRadius: 2, flexShrink: 0 }} />
              <div>
                <h3 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 400, color: "#1a1614", margin: "0 0 4px" }}>{t("common", "patronModalInReview")}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#d97706", fontWeight: 600 }}>{t("common", "pendingTeamApproval")}</p>
              </div>
            </div>
            <p style={{ color: "#7c7168", fontSize: 14, lineHeight: 1.7, margin: "0 0 28px" }}>
              {t("common", "alreadyPendingDesc")}
            </p>
            <button onClick={onClose} style={{ width: "100%", background: "#1a1614", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t("common", "gotItBtn")}</button>
          </div>
        )}

        {stage === "error" && (
          <div style={{ padding: "36px 28px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 4, height: 48, background: "#ef4444", borderRadius: 2, flexShrink: 0 }} />
              <div>
                <h3 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 400, color: "#1a1614", margin: "0 0 4px" }}>{t("common", "patronModalError")}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#ef4444", fontWeight: 600 }}>{t("common", "pleaseRetry")}</p>
              </div>
            </div>
            <p style={{ color: "#7c7168", fontSize: 14, lineHeight: 1.7, margin: "0 0 28px" }}>{errorMsg}</p>
            <button onClick={() => setStage("confirm")} style={{ width: "100%", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>{t("common", "tryAgainBtn")}</button>
            <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", fontSize: 13, color: "#9ca3af", cursor: "pointer", padding: "8px" }}>{t("common", "closeBtn")}</button>
          </div>
        )}

      </div>
    </div>
  );
}
