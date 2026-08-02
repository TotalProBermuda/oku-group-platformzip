"use client";

import { useState } from "react";
import Link from "next/link";

type Locale = "en" | "es" | "pt";
type Translatable = string | Partial<Record<Locale, string>> | null | undefined;

type Item = {
  id?: string;
  name: Translatable;
  description?: Translatable;
  price?: string | null;
  dietary: string[];
  tags: string[];
  sortOrder: number;
  isAvailable: boolean;
};
type Section = {
  id?: string;
  title: Translatable;
  subtitle?: Translatable;
  description?: Translatable;
  sortOrder: number;
  items: Item[];
};
type MenuShape = {
  id: string;
  venueSlug: string;
  menuType: "FOOD" | "DRINKS";
  menuTitle: Translatable;
  intro?: Translatable;
  pdfUrl?: string | null;
  isPublished: boolean;
  sections: Section[];
};

function asTr(v: Translatable): { en: string; es: string; pt: string } {
  if (!v) return { en: "", es: "", pt: "" };
  if (typeof v === "string") return { en: v, es: "", pt: "" };
  return { en: v.en ?? "", es: v.es ?? "", pt: v.pt ?? "" };
}

const LOCALES: Locale[] = ["en", "es", "pt"];

function TrInput({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: Translatable;
  onChange: (v: { en: string; es: string; pt: string }) => void;
  textarea?: boolean;
}) {
  const tr = asTr(value);
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7d7269", marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {LOCALES.map((loc) => {
          const Comp = textarea ? "textarea" : "input";
          return (
            <Comp
              key={loc}
              placeholder={loc.toUpperCase()}
              value={tr[loc]}
              onChange={(e: any) => onChange({ ...tr, [loc]: e.target.value })}
              style={{
                padding: "8px 10px",
                fontSize: 13,
                border: "1px solid #e0d6cc",
                borderRadius: 6,
                fontFamily: "var(--font-sans)",
                width: "100%",
                minHeight: textarea ? 60 : undefined,
                resize: textarea ? "vertical" : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function MenuEditor({ initial, canEdit }: { initial: MenuShape; canEdit: boolean }) {
  const [menu, setMenu] = useState<MenuShape>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function updateMenu(patch: Partial<MenuShape>) {
    setMenu((m) => ({ ...m, ...patch }));
  }
  function updateSection(idx: number, patch: Partial<Section>) {
    setMenu((m) => ({ ...m, sections: m.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));
  }
  function updateItem(sIdx: number, iIdx: number, patch: Partial<Item>) {
    setMenu((m) => ({
      ...m,
      sections: m.sections.map((s, i) =>
        i === sIdx ? { ...s, items: s.items.map((it, j) => (j === iIdx ? { ...it, ...patch } : it)) } : s
      ),
    }));
  }
  function moveSection(idx: number, dir: -1 | 1) {
    setMenu((m) => {
      const next = [...m.sections];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return m;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...m, sections: next.map((s, i) => ({ ...s, sortOrder: i })) };
    });
  }
  function moveItem(sIdx: number, iIdx: number, dir: -1 | 1) {
    setMenu((m) => ({
      ...m,
      sections: m.sections.map((s, i) => {
        if (i !== sIdx) return s;
        const items = [...s.items];
        const j = iIdx + dir;
        if (j < 0 || j >= items.length) return s;
        [items[iIdx], items[j]] = [items[j], items[iIdx]];
        return { ...s, items: items.map((it, k) => ({ ...it, sortOrder: k })) };
      }),
    }));
  }
  function addSection() {
    setMenu((m) => ({
      ...m,
      sections: [...m.sections, { title: { en: "New section", es: "", pt: "" }, sortOrder: m.sections.length, items: [] }],
    }));
  }
  function deleteSection(idx: number) {
    if (!confirm("Delete this entire section and all its items?")) return;
    setMenu((m) => ({ ...m, sections: m.sections.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sortOrder: i })) }));
  }
  function addItem(sIdx: number) {
    setMenu((m) => ({
      ...m,
      sections: m.sections.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              items: [
                ...s.items,
                { name: { en: "New item", es: "", pt: "" }, price: null, dietary: [], tags: [], sortOrder: s.items.length, isAvailable: true },
              ],
            }
          : s
      ),
    }));
  }
  function deleteItem(sIdx: number, iIdx: number) {
    if (!confirm("Delete this item?")) return;
    setMenu((m) => ({
      ...m,
      sections: m.sections.map((s, i) =>
        i === sIdx ? { ...s, items: s.items.filter((_, j) => j !== iIdx).map((it, k) => ({ ...it, sortOrder: k })) } : s
      ),
    }));
  }

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/menus/${menu.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuTitle: menu.menuTitle,
          intro: menu.intro ?? null,
          pdfUrl: menu.pdfUrl ?? null,
          isPublished: menu.isPublished,
          sections: menu.sections,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");
      setMsg("Saved.");
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const VENUE_LABEL: Record<string, string> = { oku: "OKÜ", catch: "CATCH", terrace: "TERRACE" };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto", paddingBottom: 120 }}>
      <Link href="/admin/menus" style={{ fontSize: 13, color: "#c41e3a", textDecoration: "none" }}>
        ← Back to menus
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 16, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c41e3a" }}>
            {VENUE_LABEL[menu.venueSlug] ?? menu.venueSlug} · {menu.menuType}
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, marginTop: 4 }}>
            {asTr(menu.menuTitle).en || "Untitled menu"}
          </h1>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={menu.isPublished}
            disabled={!canEdit}
            onChange={(e) => updateMenu({ isPublished: e.target.checked })}
          />
          Published
        </label>
      </div>

      <fieldset disabled={!canEdit} style={{ border: "none", padding: 0, margin: 0 }}>
        <div style={{ background: "#fff", border: "1px solid #e8e0d8", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <TrInput label="Menu Title" value={menu.menuTitle} onChange={(v) => updateMenu({ menuTitle: v })} />
          <TrInput label="Intro / Description" value={menu.intro} onChange={(v) => updateMenu({ intro: v })} textarea />
          <div style={{ marginBottom: 4 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7d7269", marginBottom: 6 }}>
              PDF URL (optional)
            </label>
            <input
              type="text"
              value={menu.pdfUrl ?? ""}
              onChange={(e) => updateMenu({ pdfUrl: e.target.value || null })}
              style={{ padding: "8px 10px", fontSize: 13, border: "1px solid #e0d6cc", borderRadius: 6, width: "100%" }}
            />
          </div>
        </div>

        {menu.sections.map((section, sIdx) => (
          <div key={sIdx} style={{ background: "#fff", border: "1px solid #e8e0d8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#7d7269" }}>Section {sIdx + 1} of {menu.sections.length}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} style={btnSmall}>↑</button>
                <button type="button" onClick={() => moveSection(sIdx, 1)} disabled={sIdx === menu.sections.length - 1} style={btnSmall}>↓</button>
                <button type="button" onClick={() => deleteSection(sIdx)} style={{ ...btnSmall, color: "#a01830" }}>Delete</button>
              </div>
            </div>
            <TrInput label="Section Title" value={section.title} onChange={(v) => updateSection(sIdx, { title: v })} />
            <TrInput label="Subtitle" value={section.subtitle} onChange={(v) => updateSection(sIdx, { subtitle: v })} />
            <TrInput label="Section Description" value={section.description} onChange={(v) => updateSection(sIdx, { description: v })} textarea />

            <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7d7269" }}>
              Items ({section.items.length})
            </div>
            {section.items.map((item, iIdx) => (
              <div key={iIdx} style={{ background: "#faf8f6", border: "1px solid #ece4dc", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#7d7269" }}>Item {iIdx + 1}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => moveItem(sIdx, iIdx, -1)} disabled={iIdx === 0} style={btnSmall}>↑</button>
                    <button type="button" onClick={() => moveItem(sIdx, iIdx, 1)} disabled={iIdx === section.items.length - 1} style={btnSmall}>↓</button>
                    <button type="button" onClick={() => deleteItem(sIdx, iIdx)} style={{ ...btnSmall, color: "#a01830" }}>Delete</button>
                  </div>
                </div>
                <TrInput label="Name" value={item.name} onChange={(v) => updateItem(sIdx, iIdx, { name: v })} />
                <TrInput label="Description" value={item.description} onChange={(v) => updateItem(sIdx, iIdx, { description: v })} textarea />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 2fr", gap: 12, marginTop: 8 }}>
                  <div>
                    <label style={lbl}>Price</label>
                    <input
                      type="text"
                      value={item.price ?? ""}
                      onChange={(e) => updateItem(sIdx, iIdx, { price: e.target.value || null })}
                      placeholder="$24"
                      style={inp}
                    />
                  </div>
                  <div>
                    <label style={lbl}>Dietary (comma-sep)</label>
                    <input
                      type="text"
                      value={item.dietary.join(", ")}
                      onChange={(e) => updateItem(sIdx, iIdx, { dietary: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="GF, V, VG"
                      style={inp}
                    />
                  </div>
                  <div>
                    <label style={lbl}>Tags (comma-sep)</label>
                    <input
                      type="text"
                      value={item.tags.join(", ")}
                      onChange={(e) => updateItem(sIdx, iIdx, { tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="signature, new"
                      style={inp}
                    />
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={item.isAvailable}
                    onChange={(e) => updateItem(sIdx, iIdx, { isAvailable: e.target.checked })}
                  />
                  Available (uncheck to hide from public)
                </label>
              </div>
            ))}
            <button type="button" onClick={() => addItem(sIdx)} style={btnSecondary}>+ Add item</button>
          </div>
        ))}

        <button type="button" onClick={addSection} style={btnSecondary}>+ Add section</button>
      </fieldset>

      {canEdit && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
          borderTop: "1px solid #e8e0d8", padding: "16px 40px", display: "flex",
          justifyContent: "flex-end", gap: 12, alignItems: "center", zIndex: 50,
        }}>
          {msg && <span style={{ fontSize: 13, color: msg.startsWith("Error") ? "#a01830" : "#0f766e" }}>{msg}</span>}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "10px 24px", fontSize: 14, fontWeight: 600,
              background: "#c41e3a", color: "#fff", border: "none", borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

const btnSmall: React.CSSProperties = {
  padding: "4px 10px", fontSize: 12, background: "#f5f0eb", border: "1px solid #e0d6cc",
  borderRadius: 6, cursor: "pointer", color: "#1f1a17",
};
const btnSecondary: React.CSSProperties = {
  padding: "10px 16px", fontSize: 13, background: "#fff", border: "1px dashed #c0b4a8",
  borderRadius: 8, cursor: "pointer", color: "#1f1a17", marginTop: 4,
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "#7d7269", marginBottom: 6,
};
const inp: React.CSSProperties = {
  padding: "8px 10px", fontSize: 13, border: "1px solid #e0d6cc",
  borderRadius: 6, width: "100%",
};
