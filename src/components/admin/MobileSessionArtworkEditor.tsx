"use client";

import MediaUpload from "@/components/ui/MediaUpload";

const fields = ["flyerImageUrlMobileEn", "flyerImageUrlMobileEs", "flyerImageUrlMobilePt"] as const;
const labels = ["English (EN)", "Spanish (ES)", "Portuguese (PT)"];

export default function MobileSessionArtworkEditor({ value, onChange }: {
  value: Record<string, unknown>;
  onChange: (field: string, url: string) => void;
}) {
  return (
    <fieldset style={{ border: "1px solid #e5e0d8", borderRadius: 10, padding: 16, margin: "16px 0" }}>
      <legend style={{ fontWeight: 600 }}>Mobile flyer artwork (optional)</legend>
      <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
        Upload portrait artwork for small screens. Each language uses its matching mobile flyer; if it is missing, the matching session flyer is used. This does not change the desktop artwork.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        {fields.map((field, index) => (
          <MediaUpload key={field} label={labels[index]}
            value={typeof value[field] === "string" ? value[field] as string : ""}
            onChange={url => onChange(field, url)}
            uploadEndpoint="/api/v1/admin/event-artwork/upload"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hint="Portrait JPG, PNG, WEBP or GIF · max 10 MB"
            mediaType="image" aspectRatio="portrait" maxSizeMB={10} />
        ))}
      </div>
    </fieldset>
  );
}
