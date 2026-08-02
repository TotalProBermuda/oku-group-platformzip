"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onScan: (result: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function startScanner() {
      if (!containerRef.current) return;
      try {
        const { Html5QrcodeScanner } = await import("html5-qrcode");
        if (stopped) return;

        const scanner = new Html5QrcodeScanner(
          "qr-scanner-region",
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
          },
          false
        );

        scanner.render(
          (decodedText: string) => {
            scanner.clear().catch(() => {});
            onScan(decodedText);
          },
          () => {}
        );

        scannerRef.current = scanner;
        setReady(true);
      } catch (e: any) {
        setError("Camera unavailable: " + (e.message ?? "unknown error"));
      }
    }

    startScanner();

    return () => {
      stopped = true;
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.97)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        padding: "20px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: "white", fontSize: 16 }}>Scan QR Code</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            Point camera at guest ticket or referral QR
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: "8px 16px",
            color: "white",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Cancel
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {error ? (
          <div style={{ color: "#f87171", fontSize: 14, textAlign: "center", maxWidth: 280 }}>
            {error}
            <br />
            <button onClick={onClose} style={{ marginTop: 16, padding: "10px 24px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "white", cursor: "pointer" }}>
              Go back
            </button>
          </div>
        ) : (
          <div style={{ width: "100%", maxWidth: 400 }}>
            <div
              id="qr-scanner-region"
              ref={containerRef}
              style={{ borderRadius: 16, overflow: "hidden" }}
            />
            {!ready && (
              <div style={{ textAlign: "center", color: "#6b7280", marginTop: 20, fontSize: 13 }}>
                Starting camera…
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        #qr-scanner-region video { border-radius: 12px; }
        #qr-scanner-region img { display: none !important; }
        #html5-qrcode-button-camera-permission { 
          background: #c8a96e !important; border: none !important;
          border-radius: 10px !important; padding: 12px 24px !important;
          color: #1a1614 !important; font-weight: 700 !important; cursor: pointer !important;
        }
        #html5-qrcode-button-camera-stop, #html5-qrcode-button-camera-start {
          background: rgba(255,255,255,0.1) !important; border: 1px solid rgba(255,255,255,0.15) !important;
          border-radius: 8px !important; color: white !important; cursor: pointer !important;
          padding: 8px 16px !important;
        }
      `}</style>
    </div>
  );
}
