"use client";

import dynamic from "next/dynamic";
import { QrCode } from "lucide-react";

const CheckInScanner = dynamic(() => import("@/components/checkin/CheckInScanner"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
      Loading check-in…
    </div>
  ),
});

export default function StaffCheckInPage() {
  return (
    <div>
      <div style={{ background: "#1a1614", color: "white", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#f87171", flexShrink: 0,
        }}>
          <QrCode size={22} strokeWidth={1.5} />
        </div>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, margin: 0 }}>
            Event Check-In
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
            OKÜ Hospitality Group — Staff Portal
          </p>
        </div>
      </div>
      <CheckInScanner />
    </div>
  );
}
