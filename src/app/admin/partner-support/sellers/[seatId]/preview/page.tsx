"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SellerExperience, type SellerExperienceData } from "@/components/partnerCommerce/SellerExperience";

export default function SellerSupportPreviewPage({ params }: { params: Promise<{ seatId: string }> }) {
  const [data, setData] = useState<SellerExperienceData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then(({ seatId }) => fetch(`/api/v1/admin/partner-support/seats/${encodeURIComponent(seatId)}/preview`))
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load seller preview"));
  }, [params]);

  return <main className="dashboard-canvas"><div className="dashboard-body" style={{ maxWidth: 560, margin: "0 auto", paddingInline: 16 }}>
    <Link href="/admin/partner-support" style={{ display: "inline-block", marginBottom: 16 }}>← Back to Partner Support</Link>
    <div className="dash-eyebrow">SELLER EXPERIENCE PREVIEW</div>
    <h1 className="page-header">Support view</h1>
    {error && <div className="panel" role="alert">{error}</div>}
    {!data && !error && <div className="skeleton" style={{ height: 420, borderRadius: 20 }} />}
    {data && <SellerExperience data={data} supportMode />}
  </div></main>;
}
