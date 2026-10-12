"use client";

import MediaUpload from "@/components/ui/MediaUpload";
import { seriesArtworkFields, sessionArtworkFields } from "@/lib/eventArtwork";

export default function LocalizedArtworkEditor({ kind, value, onChange }: {
  kind: "series" | "session";
  value: Record<string, unknown>;
  onChange: (field: string, url: string) => void;
}) {
  const fields = kind === "series" ? seriesArtworkFields : sessionArtworkFields;
  return (
    <fieldset style={{ border: "1px solid #e5e0d8", borderRadius: 10, padding: 16, margin: "20px 0" }}>
      <legend style={{ fontWeight: 600 }}>Localized {kind === "series" ? "series hero / flyer" : "session flyer"}</legend>
      <p style={{ fontSize: 13, color: "#6b7280" }}>Choose separate artwork for each language. Missing or unavailable artwork falls back to English, then the legacy image. Removing a locale does not delete the stored asset.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        {fields.map((field, index) => (
          <MediaUpload key={field} label={["English (EN)", "Spanish (ES)", "Portuguese (PT)"][index]}
            value={typeof value[field] === "string" ? value[field] as string : ""}
            onChange={url => onChange(field, url)}
            uploadEndpoint="/api/v1/admin/event-artwork/upload"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hint="JPG, PNG, WEBP or GIF · max 10 MB"
            mediaType="image" aspectRatio={kind === "series" ? "wide" : "portrait"} maxSizeMB={10} />
        ))}
      </div>
    </fieldset>
  );
}
