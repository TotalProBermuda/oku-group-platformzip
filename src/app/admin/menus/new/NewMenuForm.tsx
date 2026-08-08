"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const VENUES = [
  { slug: "oku",     label: "OKÜ"     },
  { slug: "catch",   label: "CATCH"   },
  { slug: "terrace", label: "TERRACE" },
];

export default function NewMenuForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Optional ?seriesId=XYZ — the API will link the new menu to that series
  // immediately, so the user never has to do a second step.
  const seriesId = searchParams.get("seriesId");
  const seriesTitle = searchParams.get("seriesTitle") ?? "";

  const [venueSlug,   setVenueSlug]   = useState(VENUES[0].slug);
  const [menuType,    setMenuType]    = useState<"FOOD" | "DRINKS">("FOOD");
  const [titleEn,     setTitleEn]     = useState("");
  const [isHouseMenu, setIsHouseMenu] = useState(seriesId ? false : true);
  const [isPublished, setIsPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!titleEn.trim()) { setError("Please enter a menu title."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/menus", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueSlug, menuType,
          menuTitle: { en: titleEn.trim() },
          isHouseMenu, isPublished,
          ...(seriesId ? { linkToSeriesId: seriesId } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error ?? "Failed to create menu"); setBusy(false); return; }
      // After creating, jump to the editor to add sections + items.
      router.push(`/admin/menus/${data.data.id}?created=1`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create menu");
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
      <Link href={seriesId ? `/admin/experiences/${seriesId}` : "/admin/menus"} style={{ fontSize: 13, color: "#6b7280" }}>
        ← {seriesId ? "Back to event" : "Back to menus"}
      </Link>

      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 30, fontWeight: 400, color: "#1a1614", marginTop: 12, marginBottom: 6 }}>
        New Menu
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 28, lineHeight: 1.5 }}>
        {seriesId
          ? <>Creating a menu attached to <strong>{seriesTitle || "this event"}</strong>. It will only show on the event page, not on the venue page.</>
          : <>Pick a venue and type, give the menu a title, then you'll be able to add sections and items in the editor.</>
        }
      </p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Field label="Venue">
          <select value={venueSlug} onChange={(e) => setVenueSlug(e.target.value)} style={inputStyle}>
            {VENUES.map((v) => <option key={v.slug} value={v.slug}>{v.label}</option>)}
          </select>
        </Field>

        <Field label="Menu type">
          <div style={{ display: "flex", gap: 8 }}>
            {(["FOOD", "DRINKS"] as const).map((t) => (
              <button
                type="button" key={t} onClick={() => setMenuType(t)}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${menuType === t ? "#c41e3a" : "#e5e0d8"}`,
                  background: menuType === t ? "#fdecef" : "white",
                  color:      menuType === t ? "#c41e3a" : "#1a1614",
                }}
              >{t === "FOOD" ? "Food" : "Drinks"}</button>
            ))}
          </div>
        </Field>

        <Field label="Title">
          <input
            type="text" value={titleEn} onChange={(e) => setTitleEn(e.target.value)}
            placeholder='e.g. "House Tasting Menu" or "Sunset Cocktails"'
            style={inputStyle}
            autoFocus
          />
          <p style={{ fontSize: 12, color: "#9a8f85", marginTop: 4 }}>You can add Spanish and Portuguese versions in the editor.</p>
        </Field>

        {!seriesId && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", border: "1px solid #e5e0d8", borderRadius: 8, background: "#fafaf9", cursor: "pointer" }}>
            <input type="checkbox" checked={isHouseMenu} onChange={(e) => setIsHouseMenu(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 13, color: "#1a1614" }}>
              <strong>House menu</strong> — show on the venue's public page as the standing menu.
              Uncheck to create an event-only menu you can attach to events later.
            </span>
          </label>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1a1614" }}>
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Publish immediately (uncheck to save as a draft)
        </label>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 13 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button type="submit" disabled={busy} className="btn btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "Creating…" : "Create & Open Editor"}
          </button>
          <Link href={seriesId ? `/admin/experiences/${seriesId}` : "/admin/menus"} className="btn btn-ghost" style={{ border: "1px solid #e5e0d8" }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7d7269", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8,
  fontSize: 14, background: "white", color: "#1a1614",
};
