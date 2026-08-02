"use client";

import { useState } from "react";

interface Props {
  url: string;
  title: string;
  imageUrl?: string;
  labels?: {
    shareHeading?: string;
    copyLink?: string;
    copied?: string;
    whatsApp?: string;
    instagram?: string;
  };
}

export default function ShareButtons({ url, title, labels }: Props) {
  const [copied, setCopied] = useState(false);

  const l = labels ?? {};

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`;

  function handleInstagram() {
    const igDeepLink =
      `instagram-stories://share` +
      `?source_url=${encodeURIComponent(url)}` +
      `&content_url=${encodeURIComponent(url)}`;

    window.location.href = igDeepLink;

    setTimeout(() => {
      if (typeof navigator.share === "function") {
        navigator.share({ title, url }).catch(() => {});
      } else {
        navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }, 1500);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
        {l.shareHeading ?? "Share"}
      </span>
      <button
        onClick={handleCopy}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: copied ? "rgba(22,163,74,0.2)" : "rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: copied ? "#86efac" : "rgba(255,255,255,0.8)", transition: "background 0.2s, color 0.2s" }}
      >
        {copied ? (l.copied ?? "Copied!") : (l.copyLink ?? "Copy Link")}
      </button>
      <a
        href={whatsAppUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "rgba(255,255,255,0.08)", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.8)", textDecoration: "none" }}
      >
        <span>💬</span>
        {l.whatsApp ?? "WhatsApp"}
      </a>
      <button
        onClick={handleInstagram}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}
      >
        <span>📷</span>
        {l.instagram ?? "Instagram"}
      </button>
    </div>
  );
}
