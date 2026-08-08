"use client";

import { useEffect, useState } from "react";
import Brandmark from "@/components/Brandmark";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import { QRCodeSVG } from "qrcode.react";

export interface GuestQRPanelProps {
  /**
   * The referral code that will be embedded in the guest URL as `?ref=<code>`.
   * - For streetside hosts this is the generic `"streetside"` token.
   * - For taxi drivers / concierges / partners this is the actor's personal code.
   */
  referralCode: string;
  /**
   * Optional override of the destination path encoded in the QR
   * (defaults to `/{locale}/reservations`). Pass e.g. `/en/experiences`
   * if a referrer should land on the experience picker.
   */
  destinationPath?: string;
  /**
   * Optional separate destination for the "fill in for them" fallback link
   * (when `onFillFormClick` is not provided). Defaults to `destinationPath`.
   * Use this on the referrer dashboard to point the fallback at a manual
   * reservation form (e.g. `/{locale}/reservations`) while keeping the QR
   * itself pointed at a different surface like `/experiences`.
   */
  manualEntryPath?: string;
  /**
   * If provided, the "fill in for them" affordance becomes a button that calls this.
   * Use this on the streetside page to switch to the host-form tab.
   * If omitted, we render a plain link to `manualEntryPath` (or the QR
   * destination as a last resort) — the host can open it on this device.
   */
  onFillFormClick?: () => void;
  /**
   * Optional caption shown beneath the OKÜ wordmark. Defaults to the standard
   * `host.streetForm.qrTagline` translation.
   */
  tagline?: string;
  /**
   * Hide the "Show this to your guest" instruction card. Set true on referrer
   * dashboards (taxi/concierge/partner) where the QR is just as likely to be
   * sent in chat as it is to be physically shown.
   */
  hideInstruction?: boolean;
  /**
   * Render a "Share on WhatsApp" CTA below the QR. Useful for referrers who
   * primarily share via messaging — the link lives in the conversation, so it
   * is not lost when the QR view is closed.
   */
  showWhatsAppShare?: boolean;
  /**
   * Hide the "or fill in for them" manual-entry affordance entirely. That copy
   * is host-oriented ("switch to the Host Form tab"); on referrer dashboards
   * (taxi/concierge) it has no matching tab, so the surrounding context is
   * better delivered by the WhatsApp/copy-link strip above.
   */
  hideManualEntry?: boolean;
  /**
   * When true (default) the panel appends `?ref=<referralCode>` to the
   * destination URL — needed for generic surfaces like `/experiences` or
   * `/reservations` that read attribution from the query string.
   * Set to false when `destinationPath` already encodes the code in the path
   * itself (e.g. `/r/<code>`), so we don't get an awkward `/r/CODE?ref=CODE`.
   */
  appendRefQuery?: boolean;
}

/**
 * Shared "show this QR to your guest" panel.
 * The streetside host page and every referrer dashboard render the SAME visual
 * so the experience is identical whether the host on the door, a taxi driver,
 * or a hotel concierge is the one holding the phone.
 */
export function GuestQRPanel({
  referralCode,
  destinationPath,
  manualEntryPath,
  onFillFormClick,
  tagline,
  hideInstruction,
  showWhatsAppShare,
  hideManualEntry,
  appendRefQuery = true,
}: GuestQRPanelProps) {
  const t = useTranslation();
  const locale = useLocale();
  const [guestUrl, setGuestUrl] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  useEffect(() => {
    const qrPath = destinationPath ?? `/${locale}/reservations`;
    const fallbackPath = manualEntryPath ?? qrPath;
    const origin = window.location.origin;
    const suffix = appendRefQuery ? `?ref=${encodeURIComponent(referralCode)}` : "";
    setGuestUrl(`${origin}${qrPath}${suffix}`);
    setManualUrl(`${origin}${fallbackPath}${suffix}`);
  }, [locale, referralCode, destinationPath, manualEntryPath, appendRefQuery]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8 }}>
      {/* Instruction card — suppressed for messaging-first referrers */}
      {!hideInstruction && (
        <div style={{
          background: "rgba(200,169,110,0.08)",
          border: "1px solid rgba(200,169,110,0.25)",
          borderRadius: 16,
          padding: "18px 20px",
          marginBottom: 24,
          width: "100%",
          maxWidth: 340,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📱</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#c8a96e", marginBottom: 6 }}>
            {t("host", "streetForm.guestQR.showToGuest")}
          </div>
          <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.55 }}>
            {t("host", "streetForm.guestQR.instructions")}
          </div>
        </div>
      )}

      {/* QR Code */}
      {guestUrl ? (
        <div style={{
          background: "white",
          borderRadius: 20,
          padding: 16,
          boxShadow: "0 0 0 1px rgba(200,169,110,0.3), 0 16px 48px rgba(0,0,0,0.5)",
          marginBottom: 20,
        }}>
          <QRCodeSVG
            value={guestUrl}
            size={248}
            level="M"
            marginSize={4}
            bgColor="#ffffff"
            fgColor="#000000"
            title="Booking QR Code"
            style={{ display: "block", borderRadius: 8 }}
          />
        </div>
      ) : (
        <div style={{
          width: 280, height: 280,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#4b5563", fontSize: 13,
          marginBottom: 20,
        }}>
          {t("host", "streetForm.guestQR.loading")}
        </div>
      )}

      {/* WhatsApp share — for referrers who primarily share via chat. The link
          becomes a persistent message in the conversation, so it is not lost
          when the QR view is closed. */}
      {showWhatsAppShare && guestUrl && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${t("host", "streetForm.guestQR.whatsAppMessage")} ${guestUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#25D366",
            color: "#0b1f17",
            fontWeight: 700,
            fontSize: 14,
            padding: "10px 18px",
            borderRadius: 999,
            textDecoration: "none",
            marginBottom: 20,
            boxShadow: "0 6px 18px rgba(37,211,102,0.35)",
          }}
        >
          <span aria-hidden style={{ fontSize: 16 }}>💬</span>
          {t("host", "streetForm.guestQR.shareWhatsApp")}
        </a>
      )}

      {/* OKU brand mark below QR */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 28 }}>
        <Brandmark size={22} />
        <span style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.1em", textAlign: "center" }}>
          {tagline ?? t("host", "streetForm.qrTagline")}
        </span>
      </div>

      {/* Divider — or fill for them. Suppressed on referrer surfaces. */}
      {!hideManualEntry && (<>
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 340, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
        <span style={{ fontSize: 11, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {t("host", "streetForm.guestQR.orFillFor")}
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      </div>

      <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center", lineHeight: 1.5 }}>
        {t("host", "streetForm.guestQR.noPhone")}{" "}
        {onFillFormClick ? (
          <button
            type="button"
            onClick={onFillFormClick}
            style={{
              background: "none", border: "none", padding: 0,
              color: "#c8a96e", fontWeight: 600, fontSize: 13,
              cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted",
            }}
          >
            {t("host", "streetForm.guestQR.hostFormTab")}
          </button>
        ) : (
          <a
            href={manualUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#c8a96e", fontWeight: 600, fontSize: 13,
              textDecoration: "underline", textDecorationStyle: "dotted",
            }}
          >
            {t("host", "streetForm.guestQR.hostFormTab")}
          </a>
        )}{" "}
        {t("host", "streetForm.guestQR.noPhoneSuffix")}
      </div>
      </>)}
    </div>
  );
}
