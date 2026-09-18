"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Data = {
  seller: { displayName: string; commercialRole: string; status: string };
  partner: { name: string };
  channel: { code: string; url: string | null; isActive: boolean; clickCount: number } | null;
};

export default function PartnerSellerPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/v1/partner/seller").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); }).catch((cause) => setError(cause.message)); }, []);
  const url = data?.channel?.url ?? "";
  return <main className="dashboard-canvas"><div className="dashboard-body" style={{ maxWidth: 560, margin: "0 auto", paddingInline: 16 }}>
    <div className="dash-eyebrow">PARTNER SELLER</div>
    <h1 className="page-header">Your guest invitation</h1>
    {error && <div className="panel" role="alert">{error}</div>}
    {!data && !error && <div className="skeleton" style={{ height: 380, borderRadius: 20 }} />}
    {data && <section className="panel" style={{ padding: 20, textAlign: "center" }}>
      <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{data.seller.displayName} · {data.partner.name}</p>
      {data.channel?.isActive && url ? <>
        <div style={{ background: "white", width: "min(100%, 320px)", margin: "20px auto", padding: 20, borderRadius: 18 }}><QRCodeSVG value={url} size={260} style={{ width: "100%", height: "auto", display: "block" }} level="M" /></div>
        <a className="btn btn-primary" href={url} style={{ minHeight: 48, width: "100%", justifyContent: "center" }}>Open guest booking link</a>
        <p style={{ fontSize: 12, overflowWrap: "anywhere", color: "var(--color-text-secondary)" }}>{data.channel.code} · {data.channel.clickCount} scans</p>
      </> : <div style={{ padding: "32px 8px" }}><h2 style={{ fontSize: 20 }}>QR awaiting approval</h2><p style={{ color: "var(--color-text-secondary)" }}>Your account is ready. OKÜ must activate this attribution channel before it can be shared.</p></div>}
    </section>}
  </div></main>;
}
