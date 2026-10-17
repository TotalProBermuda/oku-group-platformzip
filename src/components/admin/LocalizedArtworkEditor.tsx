"use client";

import { useState } from "react";
import MediaUpload from "@/components/ui/MediaUpload";
import { seriesArtworkFields, sessionArtworkFields } from "@/lib/eventArtwork";

const languageTabs = [
  { locale: "en", label: "English", short: "EN" },
  { locale: "es", label: "Español", short: "ES" },
  { locale: "pt", label: "Português", short: "PT" },
] as const;

export default function LocalizedArtworkEditor({ kind, value, onChange }: {
  kind: "series" | "session";
  value: Record<string, unknown>;
  onChange: (field: string, url: string) => void;
}) {
  const [locale, setLocale] = useState<(typeof languageTabs)[number]["locale"]>("en");
  const fields = kind === "series" ? seriesArtworkFields : sessionArtworkFields;
  const field = fields[languageTabs.findIndex((tab) => tab.locale === locale)];
  const currentUrl = typeof value[field] === "string" ? value[field] as string : "";
  const label = languageTabs.find((tab) => tab.locale === locale)!;

  return (
    <fieldset style={{ border: "1px solid #e5e0d8", borderRadius: 10, padding: 16, margin: "20px 0", minWidth: 0 }}>
      <legend style={{ fontWeight: 600 }}>Localized {kind === "series" ? "series hero / flyer" : "session flyer"}</legend>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
        Select a language, add its artwork, then save with the rest of the {kind}. Missing artwork falls back to English and then the legacy image.
      </p>
      <div role="tablist" aria-label="Artwork language" style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14 }}>
        {languageTabs.map((tab) => (
          <button key={tab.locale} type="button" role="tab" aria-selected={locale === tab.locale}
            onClick={() => setLocale(tab.locale)}
            style={{ border: locale === tab.locale ? "1px solid #9f4d36" : "1px solid #e5e0d8", borderRadius: 999, padding: "8px 14px", background: locale === tab.locale ? "#f8eee8" : "#fff", color: "#27211d", fontWeight: 650, cursor: "pointer", whiteSpace: "nowrap" }}>
            {tab.short} <span style={{ fontWeight: 400 }}>{tab.label}</span>
            {typeof value[fields[languageTabs.findIndex((item) => item.locale === tab.locale)]] === "string" && value[fields[languageTabs.findIndex((item) => item.locale === tab.locale)]] ? " · Added" : ""}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={`${label.label} artwork`} style={{ maxWidth: 520 }}>
        <MediaUpload key={field} label={`${label.label} (${label.short}) artwork`}
          value={currentUrl}
          onChange={url => onChange(field, url)}
          uploadEndpoint="/api/v1/admin/event-artwork/upload"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hint="JPG, PNG, WEBP or GIF · max 10 MB"
          mediaType="image" aspectRatio={kind === "series" ? "wide" : "portrait"} maxSizeMB={10} />
      </div>
    </fieldset>
  );
}
