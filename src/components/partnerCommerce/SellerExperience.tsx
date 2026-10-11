"use client";

import { QRCodeSVG } from "qrcode.react";
import { ShareSurfacePanel } from "@/components/referral/ShareSurfacePanel";
import { PureReferrerConsole } from "@/components/referral/console/PureReferrerConsole";
import { resolveConsoleConfig } from "@/components/referral/console/roleConfig";

export type SellerExperienceData = {
  seller: { displayName: string; commercialRole: string; status: string };
  partner: { name: string };
  channel: { code: string; url: string | null; isActive: boolean; clickCount: number } | null;
};

function formatRelationshipRole(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function SellerExperience({ data, supportMode = false }: { data: SellerExperienceData; supportMode?: boolean }) {
  const url = data.channel?.url ?? "";
  const shareable = Boolean(data.channel?.isActive && data.channel?.code && url);

  // Support preview is intentionally read-only and self-contained. In particular,
  // it must never mount the standard console's /api/v1/me/referrals polling for
  // the Superadmin who is previewing another person's account.
  if (supportMode) {
    return <>
      <div role="status" style={{ background: "#171412", color: "white", borderRadius: 14, padding: "14px 16px", marginBottom: 16, textAlign: "left" }}>
        <strong>Superadmin support preview</strong>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Viewing the read-only seller experience for {data.seller.displayName}. This access is audited; private banking details and payout actions are not available.</div>
      </div>
      <section className="panel" style={{ padding: 20, textAlign: "center" }}>
        <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{data.seller.displayName} · {data.partner.name}</p>
        {shareable ? <>
          <div style={{ background: "white", width: "min(100%, 320px)", margin: "20px auto", padding: 20, borderRadius: 18 }}><QRCodeSVG value={url} size={260} style={{ width: "100%", height: "auto", display: "block" }} level="M" /></div>
          <a className="btn btn-primary" href={url} style={{ minHeight: 48, width: "100%", justifyContent: "center" }}>Open guest booking link</a>
          <p style={{ fontSize: 12, overflowWrap: "anywhere", color: "var(--color-text-secondary)" }}>{data.channel?.code} · {data.channel?.clickCount ?? 0} scans</p>
        </> : <div style={{ padding: "32px 8px" }}><h2 style={{ fontSize: 20 }}>QR awaiting approval</h2><p style={{ color: "var(--color-text-secondary)" }}>Your account is ready. OKÜ must activate this attribution channel before it can be shared.</p></div>}
      </section>
    </>;
  }

  const config = resolveConsoleConfig({ roles: ["PARTNER"] });
  const identity = {
    displayName: data.seller.displayName,
    referralCode: shareable ? data.channel!.code : "",
    // Keep the partner relationship on Profile, while leaving the shared
    // client-facing QR, activity, earnings, and offers surfaces uncluttered.
    organization: `${data.partner.name} · ${formatRelationshipRole(data.seller.commercialRole)}`,
  };

  return (
    <div style={{
      "--layer-1": "rgba(255,255,255,0.04)",
      "--color-border": "rgba(255,255,255,0.08)",
      "--color-text": "#f3f4f6",
      "--color-text-muted": "#9ca3af",
      "--color-bg": "#050505",
    } as React.CSSProperties}>
      <PureReferrerConsole
        config={config}
        identity={identity}
        destinationPath={shareable ? url : undefined}
        appendRefQuery={false}
        manageBeneficiaryHref="/my/beneficiary"
        offersSlot={<ShareSurfacePanel />}
      />
    </div>
  );
}
