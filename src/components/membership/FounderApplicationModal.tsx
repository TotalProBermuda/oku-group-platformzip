"use client";
import { useState } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface Props {
  onClose: () => void;
}

type FormState = "idle" | "submitting" | "success" | "error";

export default function FounderApplicationModal({ onClose }: Props) {
  const t = useTranslation();
  const [state, setState] = useState<FormState>("idle");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    roleTitle: "",
    reasonForInterest: "",
  });
  const [errorMsg, setErrorMsg] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName || !form.email || !form.reasonForInterest) return;
    setState("submitting");
    try {
      const res = await fetch("/api/v1/membership/founder/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? t("common", "founderModalError"));
        setState("error");
      } else {
        setState("success");
      }
    } catch {
      setErrorMsg(t("common", "networkErrorMsg"));
      setState("error");
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(10,8,6,0.72)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--color-surface)", borderRadius: 12, maxWidth: 540, width: "100%",
        padding: "40px 36px", position: "relative", maxHeight: "90vh", overflowY: "auto",
      }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text-muted)" }}>×</button>

        {state === "success" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, marginBottom: 12 }}>{t("common", "founderModalSuccess")}</h2>
            <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
              {t("common", "founderModalSuccessThankYou")}
            </p>
            <button onClick={onClose} className="btn btn-primary">{t("common", "closeBtn")}</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "inline-block", background: "#1a1614", color: "#e8d5a3", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", padding: "4px 10px", borderRadius: 4, marginBottom: 16 }}>
                {t("common", "founderAccessOnly")}
              </div>
              <h2 style={{ fontFamily: "Georgia, serif", fontSize: 24, lineHeight: 1.3, marginBottom: 8 }}>{t("common", "founderModalTitle")}</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
                {t("common", "founderModalDesc")}
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6, letterSpacing: "0.06em" }}>{t("common", "fullNameLabel")} *</label>
                  <input name="fullName" value={form.fullName} onChange={handleChange} required
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 14, background: "var(--color-bg)", boxSizing: "border-box" }}
                    placeholder={t("common", "founderModalNamePlaceholder")} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6, letterSpacing: "0.06em" }}>{t("common", "emailLabel")} *</label>
                  <input name="email" type="email" value={form.email} onChange={handleChange} required
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 14, background: "var(--color-bg)", boxSizing: "border-box" }}
                    placeholder="you@example.com" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6, letterSpacing: "0.06em" }}>{t("common", "companyLabel")}</label>
                  <input name="company" value={form.company} onChange={handleChange}
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 14, background: "var(--color-bg)", boxSizing: "border-box" }}
                    placeholder={t("common", "founderModalOrgPlaceholder")} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6, letterSpacing: "0.06em" }}>{t("common", "roleLabel")}</label>
                  <input name="roleTitle" value={form.roleTitle} onChange={handleChange}
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 14, background: "var(--color-bg)", boxSizing: "border-box" }}
                    placeholder={t("common", "founderModalRolePlaceholder")} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6, letterSpacing: "0.06em" }}>{t("common", "founderModalReasonLabel").toUpperCase()} *</label>
                <textarea name="reasonForInterest" value={form.reasonForInterest} onChange={handleChange} required rows={4}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 14, background: "var(--color-bg)", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                  placeholder={t("common", "founderModalReasonPlaceholder")} />
              </div>

              {state === "error" && (
                <div style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "var(--color-danger)" }}>
                  {errorMsg}
                </div>
              )}

              <button type="submit" disabled={state === "submitting"}
                style={{ background: "#1a1614", color: "#e8d5a3", border: "none", borderRadius: 6, padding: "13px 24px", fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", cursor: state === "submitting" ? "not-allowed" : "pointer", opacity: state === "submitting" ? 0.7 : 1 }}>
                {state === "submitting" ? t("common", "founderModalSubmitting") : t("common", "founderModalSubmit")}
              </button>

              <p style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center", lineHeight: 1.5 }}>
                {t("common", "founderModalReviewNote")}
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
