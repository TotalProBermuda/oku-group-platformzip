"use client";

import { QRCodeSVG } from "qrcode.react";

export type SellerExperienceData = {
  seller: { displayName: string; commercialRole: string; status: string };
  partner: { name: string };
  channel: { code: string; url: string | null; isActive: boolean; clickCount: number } | null;
};

export function SellerExperience({ data, supportMode = false }: { data: SellerExperienceData; supportMode?: boolean }) {
  const url = data.channel?.url ?? "";

  return <>
    {supportMode && <div role="status" style={{ background: "#171412", color: "white", borderRadius: 14, padding: "14px 16px", marginBottom: 16, textAlign: "left" }}>
      <strong>Superadmin support preview</strong>
      <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Viewing the read-only seller experience for {data.seller.displayName}. This access is audited; private banking details and payout actions are not available.</div>
    </div>}
    <section className="panel" style={{ padding: 20, textAlign: "center" }}>
      <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{data.seller.displayName} · {data.partner.name}</p>
      {data.channel?.isActive && url ? <>
        <div style={{ background: "white", width: "min(100%, 320px)", margin: "20px auto", padding: 20, borderRadius: 18 }}><QRCodeSVG value={url} size={260} style={{ width: "100%", height: "auto", display: "block" }} level="M" /></div>
        <a className="btn btn-primary" href={url} style={{ minHeight: 48, width: "100%", justifyContent: "center" }}>Open guest booking link</a>
        <p style={{ fontSize: 12, overflowWrap: "anywhere", color: "var(--color-text-secondary)" }}>{data.channel.code} · {data.channel.clickCount} scans</p>
      </> : <div style={{ padding: "32px 8px" }}><h2 style={{ fontSize: 20 }}>QR awaiting approval</h2><p style={{ color: "var(--color-text-secondary)" }}>Your account is ready. OKÜ must activate this attribution channel before it can be shared.</p></div>}
    </section>
  </>;
}
