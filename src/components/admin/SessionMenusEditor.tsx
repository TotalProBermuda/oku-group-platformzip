"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Locale = "en" | "es" | "pt";
type MenuOption = { id: string; menuTitle: unknown; venueSlug: string; menuType: string; sortOrder?: number };
const copy: Record<Locale, { heading: string; note: string; manage: string; add: string; remove: string; select: string; loading: string; error: string; empty: string }> = {
  en: { heading: "Menus for this session", note: "Assigned menus show for this date; when none are assigned, the series menus are shown.", manage: "Create or edit structured menu content, wines, producers, and optional photos in Menu Administration, then assign the published menu here.", add: "Add menu", remove: "Remove", select: "Select a published menu", loading: "Loading menus…", error: "Could not update session menus.", empty: "No session-specific menus. Series menus will appear to guests." },
  es: { heading: "Menús de esta sesión", note: "Los menús asignados aparecen para esta fecha; si no hay ninguno, se muestran los menús de la serie.", manage: "Crea o edita el contenido del menú, vinos, productores y fotos opcionales en Administración de menús; luego asigna aquí el menú publicado.", add: "Añadir menú", remove: "Quitar", select: "Selecciona un menú publicado", loading: "Cargando menús…", error: "No se pudieron actualizar los menús.", empty: "No hay menús específicos. Los invitados verán los menús de la serie." },
  pt: { heading: "Menus desta sessão", note: "Os menus atribuídos aparecem nesta data; se nenhum estiver atribuído, os menus da série serão exibidos.", manage: "Crie ou edite o conteúdo estruturado do menu, vinhos, produtores e fotos opcionais em Administração de menus; depois atribua aqui o menu publicado.", add: "Adicionar menu", remove: "Remover", select: "Selecione um menu publicado", loading: "Carregando menus…", error: "Não foi possível atualizar os menus.", empty: "Não há menus específicos. Os menus da série serão exibidos aos convidados." },
};

function title(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return String(v.en || v.es || v.pt || "Untitled menu");
  }
  return "Untitled menu";
}

export default function SessionMenusEditor({ sessionId, locale = "en" }: { sessionId: string; locale?: Locale }) {
  const labels = copy[locale] ?? copy.en;
  const [linked, setLinked] = useState<MenuOption[]>([]);
  const [available, setAvailable] = useState<MenuOption[]>([]);
  const [selection, setSelection] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/sessions/${encodeURIComponent(sessionId)}/menus`);
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.error || labels.error);
      setLinked(result.data.linked ?? []);
      setAvailable(result.data.available ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.error);
    } finally {
      setLoading(false);
    }
  }, [sessionId, labels.error]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(method: "POST" | "DELETE", menuId: string) {
    setBusy(true);
    setMessage("");
    try {
      const suffix = method === "DELETE" ? `?menuId=${encodeURIComponent(menuId)}` : "";
      const response = await fetch(`/api/v1/admin/sessions/${encodeURIComponent(sessionId)}/menus${suffix}`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify({ menuId }) : undefined,
      });
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.error || labels.error);
      setSelection("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.error);
    } finally {
      setBusy(false);
    }
  }

  return <section className="sc-section">
    <h4>{labels.heading}</h4>
    <p className="sc-value">{labels.note}</p>
    <p className="sc-value">{labels.manage} <Link href="/admin/menus" style={{ color: "#c41e3a", fontWeight: 600 }}>Menu Administration</Link></p>
    {loading ? <p className="sc-value">{labels.loading}</p> : linked.length ? linked.map((menu) => (
      <div key={menu.id} className="sc-inline" style={{ justifyContent: "space-between", borderTop: "1px solid #eee6de", paddingTop: 8, marginTop: 8 }}>
        <span>{title(menu.menuTitle)} · {menu.venueSlug} · {menu.menuType.toLowerCase()}</span>
        <button type="button" disabled={busy} className="sc-create" onClick={() => void mutate("DELETE", menu.id)}>{labels.remove}</button>
      </div>
    )) : <p className="sc-value">{labels.empty}</p>}
    <div className="sc-inline" style={{ marginTop: 10 }}>
      <select aria-label={labels.select} value={selection} disabled={busy || loading} onChange={(event) => setSelection(event.target.value)}>
        <option value="">{labels.select}</option>
        {available.filter((menu) => !linked.some((item) => item.id === menu.id)).map((menu) => <option key={menu.id} value={menu.id}>{title(menu.menuTitle)} · {menu.venueSlug} · {menu.menuType.toLowerCase()}</option>)}
      </select>
      <button type="button" disabled={!selection || busy || loading} className="sc-create" onClick={() => void mutate("POST", selection)}>{labels.add}</button>
    </div>
    {message && <p role="alert" className="sc-alert">{message}</p>}
  </section>;
}
