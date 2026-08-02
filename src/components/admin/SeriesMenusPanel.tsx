"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LocalizedJson = string | Record<string, string> | null | undefined;

type MenuHeader = {
  id: string;
  venueSlug: string;
  menuType: "FOOD" | "DRINKS";
  menuTitle: LocalizedJson;
  isHouseMenu: boolean;
  isPublished: boolean;
  parentMenuId: string | null;
  _count: { sections: number; eventLinks?: number };
};

type EventMenuLink = {
  id: string;
  seriesId: string;
  menuId: string;
  sortOrder: number;
  menu: MenuHeader;
};

const VENUE_LABEL: Record<string, string> = { oku: "OKÜ", catch: "CATCH", terrace: "TERRACE" };

function titleOf(t: LocalizedJson, locale: "en" | "es" | "pt" = "en"): string {
  if (!t) return "(Untitled)";
  if (typeof t === "string") return t;
  return t[locale] || t.en || Object.values(t).find(Boolean) || "(Untitled)";
}

export default function SeriesMenusPanel({ seriesId, seriesTitle }: { seriesId: string; seriesTitle: string }) {
  const [links, setLinks] = useState<EventMenuLink[]>([]);
  const [allMenus, setAllMenus] = useState<MenuHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"none" | "pick" | "duplicate">("none");
  const [pickedMenuId, setPickedMenuId] = useState<string>("");
  const [duplicateSourceId, setDuplicateSourceId] = useState<string>("");
  const [duplicateTitle, setDuplicateTitle] = useState<string>("");

  const flash = (msg: string, isError = false) => {
    if (isError) { setError(msg); setSuccess(null); }
    else         { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 3500);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, menusRes] = await Promise.all([
        fetch(`/api/v1/admin/experiences/${seriesId}/menus`).then((r) => r.json()),
        fetch(`/api/v1/admin/menus`).then((r) => r.json()).catch(() => null),
      ]);
      if (linksRes?.ok) setLinks(linksRes.data ?? []);
      // Fall back to listAllMenus if the lighter endpoint isn't available.
      if (menusRes?.ok && Array.isArray(menusRes.data)) {
        setAllMenus(
          menusRes.data.map((m: any) => ({
            id: m.id,
            venueSlug: m.venueSlug,
            menuType: m.menuType ?? (m.menuType === "drinks" ? "DRINKS" : "FOOD"),
            menuTitle: m.menuTitle,
            isHouseMenu: m.isHouseMenu ?? true,
            isPublished: m.isPublished ?? true,
            parentMenuId: m.parentMenuId ?? null,
            _count: { sections: m._count?.sections ?? (m.sections?.length ?? 0) },
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Filter the picker dropdown to menus not already linked to this series.
  const linkedIds = useMemo(() => new Set(links.map((l) => l.menuId)), [links]);
  const pickableMenus = useMemo(() => allMenus.filter((m) => !linkedIds.has(m.id)), [allMenus, linkedIds]);
  const houseMenus = useMemo(() => allMenus.filter((m) => m.isHouseMenu), [allMenus]);

  async function attachExisting() {
    if (!pickedMenuId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/experiences/${seriesId}/menus`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuId: pickedMenuId }),
      });
      const data = await res.json();
      if (data.ok) { flash("Menu attached"); setPickedMenuId(""); setPickerMode("none"); refresh(); }
      else flash(data.error ?? "Failed to attach", true);
    } finally { setBusy(false); }
  }

  async function duplicateAndAttach() {
    if (!duplicateSourceId) return;
    setBusy(true);
    try {
      const source = allMenus.find((m) => m.id === duplicateSourceId);
      const titleJson = duplicateTitle.trim()
        ? { en: duplicateTitle.trim() }
        : (source ? { en: `${titleOf(source.menuTitle)} — ${seriesTitle}` } : undefined);
      const res = await fetch(`/api/v1/admin/experiences/${seriesId}/menus`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateFromMenuId: duplicateSourceId, newTitle: titleJson }),
      });
      const data = await res.json();
      if (data.ok) {
        flash("Menu duplicated and attached");
        setDuplicateSourceId(""); setDuplicateTitle(""); setPickerMode("none");
        refresh();
      } else flash(data.error ?? "Failed to duplicate", true);
    } finally { setBusy(false); }
  }

  async function unlink(linkId: string) {
    if (!confirm("Remove this menu from the event? The menu itself stays intact.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/experiences/${seriesId}/menus?linkId=${linkId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) { flash("Menu unlinked"); refresh(); }
      else flash(data.error ?? "Failed to unlink", true);
    } finally { setBusy(false); }
  }

  if (loading) return <p style={{ color: "#7d7269", fontSize: 14 }}>Loading menus…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Event Menus</h3>
        <p style={{ fontSize: 13, color: "#7d7269", lineHeight: 1.5 }}>
          Attach a bespoke food or drinks menu to this event. Guests on the event page will see this
          menu instead of the venue's standing house menu. The house menu stays untouched for walk-in guests.
        </p>
      </div>

      {(error || success) && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 13,
          background: error ? "#fef2f2" : "#f0fdf4",
          color:      error ? "#dc2626" : "#15803d",
          border:    `1px solid ${error ? "#fecaca" : "#bbf7d0"}`,
        }}>{error ?? success}</div>
      )}

      {links.length === 0 ? (
        <div style={{ padding: "24px", background: "#fafaf9", border: "1px dashed #e5e0d8", borderRadius: 10, color: "#7d7269", fontSize: 14 }}>
          No menus attached yet. Pick an existing menu or duplicate the venue's house menu as a starting point.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {links.map((l) => (
            <div key={l.id} style={{ background: "#fff", border: "1px solid #e5e0d8", borderRadius: 10, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9a8f85", marginBottom: 4 }}>
                  {VENUE_LABEL[l.menu.venueSlug] ?? l.menu.venueSlug} · {l.menu.menuType === "FOOD" ? "Food" : "Drinks"}
                  {!l.menu.isHouseMenu && <span style={{ marginLeft: 6, color: "#c41e3a" }}>· event-only copy</span>}
                  {!l.menu.isPublished && <span style={{ marginLeft: 6, color: "#92400e" }}>· unpublished</span>}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#1f1a17", marginBottom: 4 }}>{titleOf(l.menu.menuTitle)}</div>
                <div style={{ fontSize: 12, color: "#7d7269" }}>
                  {l.menu._count.sections} section{l.menu._count.sections === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Link
                  href={`/admin/menus/${l.menu.id}`}
                  target="_blank"
                  style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #e5e0d8", borderRadius: 6, color: "#1f1a17", background: "#fff", textDecoration: "none", fontWeight: 600 }}
                >Open Editor ↗</Link>
                <button
                  onClick={() => unlink(l.id)}
                  disabled={busy}
                  style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #fca5a5", borderRadius: 6, color: "#dc2626", background: "#fff", cursor: busy ? "not-allowed" : "pointer", fontWeight: 600 }}
                >Unlink</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pickerMode === "none" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setPickerMode("pick")} className="btn btn-primary" style={{ fontSize: 13 }}>+ Pick existing menu</button>
          <button onClick={() => setPickerMode("duplicate")} className="btn btn-ghost" style={{ fontSize: 13, border: "1px solid #e5e0d8" }}>+ Duplicate house menu</button>
          <Link
            href={`/admin/menus/new?seriesId=${encodeURIComponent(seriesId)}&seriesTitle=${encodeURIComponent(seriesTitle)}`}
            className="btn btn-ghost"
            style={{ fontSize: 13, border: "1px solid #e5e0d8", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >+ Create new menu from scratch</Link>
        </div>
      )}

      {pickerMode === "pick" && (
        <div style={{ background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Attach an existing menu</div>
          <select value={pickedMenuId} onChange={(e) => setPickedMenuId(e.target.value)} style={{ padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
            <option value="">— Select a menu —</option>
            {pickableMenus.map((m) => (
              <option key={m.id} value={m.id}>
                {(VENUE_LABEL[m.venueSlug] ?? m.venueSlug)} · {m.menuType === "FOOD" ? "Food" : "Drinks"} · {titleOf(m.menuTitle)}{!m.isHouseMenu ? " (event copy)" : ""}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setPickerMode("none"); setPickedMenuId(""); }} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
            <button onClick={attachExisting} disabled={!pickedMenuId || busy} className="btn btn-primary" style={{ fontSize: 13, opacity: !pickedMenuId || busy ? 0.5 : 1 }}>Attach</button>
          </div>
        </div>
      )}

      {pickerMode === "duplicate" && (
        <div style={{ background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Duplicate a house menu</div>
          <p style={{ fontSize: 12, color: "#7d7269", margin: 0 }}>
            A copy of the chosen menu (sections + items + prices) is created as an event-only menu.
            You can edit it from this panel without affecting the original.
          </p>
          <select value={duplicateSourceId} onChange={(e) => setDuplicateSourceId(e.target.value)} style={{ padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
            <option value="">— Select source house menu —</option>
            {houseMenus.map((m) => (
              <option key={m.id} value={m.id}>
                {(VENUE_LABEL[m.venueSlug] ?? m.venueSlug)} · {m.menuType === "FOOD" ? "Food" : "Drinks"} · {titleOf(m.menuTitle)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={duplicateTitle}
            onChange={(e) => setDuplicateTitle(e.target.value)}
            placeholder={`e.g. "${seriesTitle} — Tasting Menu"`}
            style={{ padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14 }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setPickerMode("none"); setDuplicateSourceId(""); setDuplicateTitle(""); }} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
            <button onClick={duplicateAndAttach} disabled={!duplicateSourceId || busy} className="btn btn-primary" style={{ fontSize: 13, opacity: !duplicateSourceId || busy ? 0.5 : 1 }}>Duplicate &amp; Attach</button>
          </div>
        </div>
      )}
    </div>
  );
}
