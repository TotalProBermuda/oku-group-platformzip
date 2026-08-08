"use client";

import { useEffect, useState } from "react";
import { GuestQRPanel } from "@/components/referral/GuestQRPanel";

export interface CommissionEarnerActionPanelProps {
  referralCode: string;
  /** Canonical share URL from the backend. When provided, overrides the
   * locally-computed link for copy/share so attribution matches the
   * authoritative URL issued by the API. The QR (rendered by GuestQRPanel)
   * still encodes the standard /r/<code> redirect. */
  referralUrl?: string | null;
  destinationPath?: string;
  appendRefQuery?: boolean;
  shareTitle?: string;
  shareText?: string;
  ticketLinks?: { label: string; href: string }[];
  inviteHref?: string;
  inviteLabel?: string;
  manualInviteHref?: string;
  manualInviteLabel?: string;
  commissionLabel?: string | null;
  attributionOnly?: boolean;
  hideQR?: boolean;
}

/**
 * Shared action area for every commission earner (referrer, influencer,
 * partner, host). Renders the same QR + WhatsApp + copy-link primitives so
 * the experience is identical regardless of persona — plus optional ticket
 * link buttons, an invite CTA, and a commission/attribution status badge.
 */
export function CommissionEarnerActionPanel({
  referralCode,
  referralUrl,
  destinationPath,
  appendRefQuery = true,
  shareTitle = "Book with OKÜ",
  shareText,
  ticketLinks,
  inviteHref,
  inviteLabel = "Invite a Guest",
  manualInviteHref,
  manualInviteLabel = "Manual entry",
  commissionLabel,
  attributionOnly,
  hideQR,
}: CommissionEarnerActionPanelProps) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function") {
      setCanShare(true);
    }
    if (referralUrl && referralUrl.length > 0) {
      // Use canonical backend-issued URL when provided.
      setLinkUrl(referralUrl);
    } else {
      const path = destinationPath ?? `/r/${referralCode}`;
      const suffix = appendRefQuery ? `?ref=${encodeURIComponent(referralCode)}` : "";
      setLinkUrl(`${window.location.origin}${path}${suffix}`);
    }
  }, [referralCode, referralUrl, destinationPath, appendRefQuery]);

  const copy = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const share = async () => {
    if (!linkUrl) return;
    try {
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
        title: shareTitle,
        text: shareText ?? shareTitle,
        url: linkUrl,
      });
    } catch {
      copy();
    }
  };

  return (
    <section style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16,
      padding: "20px 18px 24px",
      marginBottom: 20,
    }}>
      {/* Status badge: commission or attribution-only */}
      {(commissionLabel || attributionOnly) && (
        <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}>
          <span style={{
            padding: "3px 10px",
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: attributionOnly ? "rgba(156,163,175,0.15)" : "rgba(16,185,129,0.15)",
            color: attributionOnly ? "#9ca3af" : "#10b981",
            border: `1px solid ${attributionOnly ? "rgba(156,163,175,0.4)" : "rgba(16,185,129,0.4)"}`,
          }}>
            {commissionLabel ?? "Attribution only"}
          </span>
        </div>
      )}

      {/* QR + WhatsApp share — main action */}
      {!hideQR && (
        <GuestQRPanel
          referralCode={referralCode}
          destinationPath={destinationPath}
          appendRefQuery={appendRefQuery}
          hideInstruction
          hideManualEntry
          showWhatsAppShare
        />
      )}

      {/* Copy-link strip — secondary share path */}
      <div style={{
        marginTop: hideQR ? 0 : 16,
        paddingTop: hideQR ? 0 : 16,
        borderTop: hideQR ? "none" : "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8, textAlign: "center" }}>
          {hideQR ? "Your referral link" : "Or copy your link"}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(200,169,110,0.08)",
          border: "1px solid rgba(200,169,110,0.25)",
          borderRadius: 10, padding: "8px 10px",
        }}>
          <span style={{
            fontFamily: "monospace", fontSize: 12, color: "#c8a96e",
            fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap", flex: 1,
          }}>
            {linkUrl ? linkUrl.replace(/^https?:\/\//, "") : `Loading…`}
          </span>
          <button
            onClick={copy}
            style={{
              background: copied ? "#10b981" : "rgba(200,169,110,0.2)",
              border: "none", borderRadius: 8, padding: "6px 12px",
              color: copied ? "#fff" : "#c8a96e", fontSize: 12,
              fontWeight: 700, cursor: "pointer", flexShrink: 0,
            }}
          >
            {copied ? "✓ Copied" : "Copy Link"}
          </button>
          {canShare && (
            <button
              onClick={share}
              aria-label="Share referral link"
              style={{
                background: "rgba(200,169,110,0.2)",
                border: "none", borderRadius: 8, padding: "6px 12px",
                color: "#c8a96e", fontSize: 12,
                fontWeight: 700, cursor: "pointer", flexShrink: 0,
              }}
            >
              ↗ Share
            </button>
          )}
        </div>
      </div>

      {/* Optional event/series ticket links */}
      {ticketLinks && ticketLinks.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {ticketLinks.map((tl) => (
            <a
              key={tl.href}
              href={tl.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(200,169,110,0.12)",
                border: "1px solid rgba(200,169,110,0.35)",
                color: "#c8a96e",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.02em",
              }}
            >
              Open Ticket Link · {tl.label}
            </a>
          ))}
        </div>
      )}

      {/* Optional invite CTAs (manual invite form or seller-seat tools) */}
      {(inviteHref || manualInviteHref) && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {inviteHref && (
            <a
              href={inviteHref}
              style={{
                flex: 1,
                minWidth: 140,
                textAlign: "center",
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(96,165,250,0.12)",
                border: "1px solid rgba(96,165,250,0.35)",
                color: "#60a5fa",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {inviteLabel}
            </a>
          )}
          {manualInviteHref && (
            <a
              href={manualInviteHref}
              style={{
                flex: 1,
                minWidth: 140,
                textAlign: "center",
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#9ca3af",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {manualInviteLabel}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
