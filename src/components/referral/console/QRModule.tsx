"use client";

/**
 * Pure Referrer Console — QR module.
 *
 * Thin wrapper over the shared `GuestQRPanel` that enforces the "clean QR"
 * rule: NO stats or money above the QR. It only forwards presentation flags
 * from the resolved console capabilities so every referrer archetype shows
 * the same guest-facing QR.
 *
 * When `referralCode` is empty (partner/influencer not yet assigned a code),
 * renders a clear "no code" placeholder instead of passing an empty string
 * to GuestQRPanel — which would produce a QR with `?ref=` and no attribution.
 */
import { GuestQRPanel } from "@/components/referral/GuestQRPanel";
import type { ConsoleCapabilities } from "./types";

export interface QRModuleProps {
  referralCode: string;
  capabilities: ConsoleCapabilities;
  /** Optional QR destination override (defaults to the panel's own default). */
  destinationPath?: string;
  /** Optional separate fallback path for manual entry. */
  manualEntryPath?: string;
  /** Append `?ref=<code>` to the destination (default true). */
  appendRefQuery?: boolean;
  /** Optional caption under the OKÜ wordmark. */
  tagline?: string;
}

export function QRModule({
  referralCode,
  capabilities,
  destinationPath,
  manualEntryPath,
  appendRefQuery = true,
  tagline,
}: QRModuleProps) {
  if (!referralCode) {
    return (
      <div style={{
        textAlign: "center",
        padding: "40px 24px",
        color: "var(--color-text-muted, #6b7280)",
        fontSize: 13,
        lineHeight: 1.6,
      }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>◎</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>No referral code assigned yet</div>
        <div>Contact your OKÜ account manager to activate your referral link.</div>
      </div>
    );
  }

  return (
    <GuestQRPanel
      referralCode={referralCode}
      destinationPath={destinationPath}
      manualEntryPath={manualEntryPath}
      appendRefQuery={appendRefQuery}
      tagline={tagline}
      hideInstruction={!capabilities.showQRInstruction}
      hideManualEntry={!capabilities.showMenuTab}
      showWhatsAppShare={capabilities.showWhatsAppShare}
    />
  );
}

export default QRModule;
