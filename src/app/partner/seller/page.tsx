"use client";

import { useEffect, useState } from "react";
import { SellerExperience, type SellerExperienceData } from "@/components/partnerCommerce/SellerExperience";

export default function PartnerSellerPage() {
  const [data, setData] = useState<SellerExperienceData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/v1/partner/seller").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); }).catch((cause) => setError(cause.message)); }, []);
  return <main className="dashboard-canvas"><div className="dashboard-body" style={{ maxWidth: 560, margin: "0 auto", paddingInline: 16 }}>
    <div className="dash-eyebrow">PARTNER SELLER</div>
    <h1 className="page-header">Your guest invitation</h1>
    {error && <div className="panel" role="alert">{error}</div>}
    {!data && !error && <div className="skeleton" style={{ height: 380, borderRadius: 20 }} />}
    {data && <SellerExperience data={data} />}
  </div></main>;
}
