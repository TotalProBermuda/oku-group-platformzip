"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import MediaUpload from "@/components/ui/MediaUpload";
import EventArtwork from "@/components/ui/EventArtwork";
import { sessionArtworkCandidates } from "@/lib/eventArtwork";
import { panamaDateTimeLocalInput, panamaDateTimeLocalIso, PANAMA_TIME_ZONE } from "@/lib/panamaDateTime";

type Effective = { value: unknown; source: string; mode: "inherit" | "override" | "clear" };
type Session = {
  id: string; title: string; startsAt: string; endsAt: string; status: string;
  inventory: { sold: number; held: number; issued: number; minimum: number };
  hasTicketHistory?: boolean;
  fields: Record<string, Effective>;
};
type Option = { id: string; displayName: string };
type SponsorOption = { id: string; label: string };
type Payload = {
  fields: string[];
  sessions: Session[];
  defaults: Record<string, Effective>;
  options: { tickets: { id: string; name: string }[]; entities: Option[]; profiles: Option[]; sponsorTiers: SponsorOption[] };
};
type Edit = { mode: "inherit" | "override" | "clear"; value?: unknown };
type Draft = { edits: Record<string, Edit>; schedule: { startsAt: string; endsAt: string }; postponement: { reason: string; treatment: "PRESERVE_ADMISSION" | "HOLD_PENDING_DATE" } | null };
type Preview = {
  previewId: string; requestId: string; targets: Array<{ id: string; title: string; inventory: Session["inventory"]; changes: Array<{ field: string; before: Effective; after: Effective }>; warnings: string[]; blocked: string[]; noticeCounts: { queued: number; missingContacts: number; locales: Record<string, number> } }>;
  blocked: string[]; warnings: string[]; expiresAt: string;
};

const locales = ["en", "es", "pt"] as const;
const roles = ["PRIMARY_HOST", "CO_HOST", "SPONSOR", "BRAND_PARTNER"];
const profileRoles = ["HOST", "CO_HOST", "MC", "PRESENTER", "PARTNER", "SPONSOR", "CURATOR", "REFERRER_ORG"];
const labels: Record<string, string> = {
  "content.title": "Title", "content.subtitle": "Subtitle", "content.description": "Description",
  "artwork": "Flyer", capacity: "Capacity", "giftBagEnabled": "Gift bag", "streetsideEnabled": "Streetside", "allowLateSales": "Late sales",
};
const input: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d9d0c7", borderRadius: 8, padding: "10px 11px", background: "#fffefa", color: "#27211d", font: "inherit", fontSize: 14 };
const smallButton: CSSProperties = { border: "1px solid #d9d0c7", background: "#fffefa", borderRadius: 8, padding: "8px 11px", cursor: "pointer", color: "#4d4038", font: "inherit", fontSize: 13 };
const fieldKey = (base: string, locale: string) => `${base}.${locale}`;
const prettyDate = (date: string, options: Intl.DateTimeFormatOptions) => new Date(date).toLocaleString(undefined, { ...options, timeZone: PANAMA_TIME_ZONE });

function initialDraft(session: Session): Draft {
  return { edits: {}, schedule: { startsAt: panamaDateTimeLocalInput(new Date(session.startsAt)), endsAt: panamaDateTimeLocalInput(new Date(session.endsAt)) }, postponement: null };
}

export default function SessionCardsEditor({ seriesId, sessions, canManageRestricted, onSaved }: {
  seriesId: string; sessions: Array<{ id: string; title?: string | null; subtitle?: string | null; startsAt: string; endsAt: string; capacity: number; status: string; flyerImageUrl?: string | null; flyerImageUrlEn?: string | null; flyerImageUrlEs?: string | null; flyerImageUrlPt?: string | null }>;
  canManageRestricted: boolean; onSaved: () => Promise<void> | void;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [locale, setLocale] = useState<(typeof locales)[number]>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hostQuery, setHostQuery] = useState("");
  const [hostRole, setHostRole] = useState("PRIMARY_HOST");
  const [createHost, setCreateHost] = useState(false);
  const [hostName, setHostName] = useState("");
  const [hostType, setHostType] = useState<"PERSON" | "COMPANY">("PERSON");
  const [hostError, setHostError] = useState("");
  const [returnedPreview, setReturnedPreview] = useState<Preview | null>(null);
  const [retryPreview, setRetryPreview] = useState<Preview | null>(null);
  const [scheduleProtected, setScheduleProtected] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const active = payload?.sessions.find((item) => item.id === activeId) ?? null;
  const dirty = Boolean(draft && (Object.keys(draft.edits).length || draft.schedule.startsAt !== (active && panamaDateTimeLocalInput(new Date(active.startsAt))) || draft.schedule.endsAt !== (active && panamaDateTimeLocalInput(new Date(active.endsAt))) || draft.postponement));

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(`/api/v1/admin/series/${seriesId}/session-management`);
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Could not load session details.");
      setPayload(result.data);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not load session details."); }
    finally { setLoading(false); }
  }, [seriesId]);
  useEffect(() => { void load(); }, [load]);

  const closeEditor = useCallback((force = false) => {
    if (busy && !force) return;
    if (!force && dirty && !window.confirm("Discard unsaved changes for this date?")) return;
    setActiveId(null); setDraft(null); setReturnedPreview(null); setError(""); setCreateHost(false);
    const returnId = activeId;
    requestAnimationFrame(() => {
      // Reloading the cards can replace the original button node.
      const button = returnId ? document.querySelector<HTMLButtonElement>(`button[data-edit-session="${CSS.escape(returnId)}"]`) : openerRef.current;
      button?.focus();
    });
  }, [busy, dirty, activeId]);

  useEffect(() => { if (activeId) closeRef.current?.focus(); }, [activeId]);
  useEffect(() => {
    if (!activeId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeEditor(); }
      if (event.key === "Tab") {
        const sheet = document.querySelector<HTMLElement>("[data-session-sheet]");
        if (!sheet) return;
        const focusables = Array.from(sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'));
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeId, closeEditor]);

  function openEditor(id: string, button: HTMLButtonElement) {
    const session = payload?.sessions.find((item) => item.id === id);
    if (!session) return;
    openerRef.current = button;
    setActiveId(id); setDraft(initialDraft(session)); setError(""); setNotice(""); setReturnedPreview(null); setRetryPreview(null); setScheduleProtected(false);
    setLocale("en"); setCreateHost(false); setHostError("");
  }
  function setEdit(key: string, value: unknown) {
    const mode = value === "" && (key.startsWith("content.") || key.startsWith("artwork.")) ? "clear" : "override";
    setDraft((current) => current ? { ...current, edits: { ...current.edits, [key]: { mode, ...(mode === "override" ? { value } : {}) } } } : current);
    setReturnedPreview(null);
    setRetryPreview(null);
  }
  function resetField(key: string) {
    setDraft((current) => current ? { ...current, edits: { ...current.edits, [key]: { mode: "inherit" } } } : current);
    setReturnedPreview(null);
    setRetryPreview(null);
  }
  function effective(key: string) {
    const edit = draft?.edits[key];
    return edit?.mode === "clear" ? null : edit?.mode === "override" ? edit.value : edit?.mode === "inherit" ? payload?.defaults[key]?.value : active?.fields[key]?.value;
  }
  function sourceLabel(key: string) {
    return draft?.edits[key]?.mode === "inherit" || (!draft?.edits[key] && active?.fields[key]?.mode === "inherit") ? "Using series details" : "Specific to this date";
  }
  function resetControl(key: string) {
    const restricted = key.startsWith("ticket.") || key.startsWith("artwork.") || key.startsWith("profiles.");
    const alreadyInherited = draft?.edits[key]?.mode === "inherit" || (!draft?.edits[key] && active?.fields[key]?.mode === "inherit");
    return <button type="button" style={smallButton} onClick={() => resetField(key)} disabled={alreadyInherited || (restricted && !canManageRestricted)}>Use series details</button>;
  }
  function fieldLabel(key: string) {
    if (key.startsWith("ticket.")) {
      const [, id, type] = key.split(".");
      const ticket = payload?.options.tickets.find((item) => item.id === id);
      return `${ticket?.name ?? "Ticket"} · ${type === "price" ? "Price" : "Available"}`;
    }
    if (key.startsWith("hosts.")) return key.split(".")[1].replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
    if (key.startsWith("profiles.")) return key.split(".")[1].replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
    if (key === "sponsors") return "Sponsors";
    if (key.startsWith("content.")) return labels[key.slice(0, key.lastIndexOf("."))] ?? "Details";
    if (key.startsWith("artwork.")) return `Flyer · ${key.split(".")[1].toUpperCase()}`;
    return labels[key] ?? key;
  }
  function displayValue(key: string, value: unknown): string {
    if (value == null || value === "") return "None";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.map((item) => {
      if (key === "sponsors") return payload?.options.entities.find((entity) => entity.id === item.entityId)?.displayName ?? "Sponsor";
      const options = key.startsWith("profiles.") ? payload?.options.profiles : payload?.options.entities;
      return options?.find((option) => option.id === item)?.displayName ?? String(item);
    }).join(", ") || "None";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  async function save(candidate: Draft | null = draft) {
    if (!active || !candidate) return;
    setBusy(true); setError(""); setNotice(""); setReturnedPreview(null);
    try {
      if (retryPreview && candidate === draft) {
        await applyPreview(retryPreview);
        return;
      }
      const patch = Object.fromEntries(Object.entries(candidate.edits).map(([key, edit]) => [key, { mode: edit.mode, ...(edit.mode === "override" ? { value: edit.value } : {}) }]));
      const startsAt = panamaDateTimeLocalIso(candidate.schedule.startsAt);
      const endsAt = panamaDateTimeLocalIso(candidate.schedule.endsAt);
      const changedSchedule = candidate.schedule.startsAt !== panamaDateTimeLocalInput(new Date(active.startsAt)) ||
        candidate.schedule.endsAt !== panamaDateTimeLocalInput(new Date(active.endsAt));
      if (!candidate.schedule.startsAt || !candidate.schedule.endsAt || new Date(endsAt) <= new Date(startsAt)) {
        setError("Choose an end time after the start time.");
        return;
      }
      const capacity = Number(effective("capacity"));
      if (!Number.isInteger(capacity) || capacity < active.inventory.minimum || capacity > 100000) {
        setError(`Capacity must be between ${active.inventory.minimum} and 100,000.`);
        return;
      }
      if (!Object.keys(patch).length && !changedSchedule) { setError("Make a change before saving."); return; }
      const body: Record<string, unknown> = { kind: "sessions", sessionIds: [active.id], patch };
      if (changedSchedule && candidate.postponement?.treatment !== "HOLD_PENDING_DATE") body.schedules = { [active.id]: { startsAt, endsAt } };
      // Reverting a tentative date change must never attach a stale postponement
      // to an otherwise unrelated content/artwork/roster save.
      if (changedSchedule && candidate.postponement) body.postponement = candidate.postponement;
      const previewResponse = await fetch(`/api/v1/admin/series/${seriesId}/session-management`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const previewResult = await previewResponse.json();
      if (!previewResponse.ok || !previewResult?.ok) throw new Error(previewResult?.error || "Could not prepare changes.");
      const preview = previewResult.data as Preview;
      const hasScheduleDelta = preview.targets.some((target) => target.changes.some((change) => change.field === "occurrenceSchedule"));
      const protectedHistory = active.hasTicketHistory ?? (active.inventory.sold + active.inventory.held + active.inventory.issued > 0);
      if ((hasScheduleDelta || changedSchedule) && protectedHistory && !candidate.postponement) {
        setRetryPreview(null);
        setScheduleProtected(true);
        setDraft((current) => current ? { ...current, postponement: { reason: "", treatment: "PRESERVE_ADMISSION" } } : current);
        setError("This date has ticket or checkout history. Add postponement details to move the date; other edits can still be saved without changing its time.");
        return;
      }
      if (preview.blocked.length || preview.targets.some((target) => target.blocked.length)) {
        setRetryPreview(null);
        setReturnedPreview(preview);
        setError([...preview.blocked, ...preview.targets.flatMap((target) => target.blocked)].join(" "));
        return;
      }
      setRetryPreview(preview);
      await applyPreview(preview);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this date."); }
    finally { setBusy(false); }
  }
  async function applyPreview(preview: Preview) {
    setReturnedPreview(preview);
    const response = await fetch(`/api/v1/admin/series/${seriesId}/session-management`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewId: preview.previewId, requestId: preview.requestId }) });
    const result = await response.json();
    if (!response.ok || !result?.ok) {
      if (response.status === 409) {
        setRetryPreview(null);
        setError(result?.error || "This date changed while you were editing. Your draft is preserved; refreshed values are shown.");
        await load();
        return;
      }
      throw new Error(result?.error || "Could not save this date.");
    }
    setRetryPreview(null);
    setNotice("Changes saved for this date.");
    await onSaved();
    await load();
    closeEditor(true);
  }
  async function createHostEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setHostError("");
    try {
      const response = await fetch("/api/v1/admin/entities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: hostType, displayName: hostName.trim() }) });
      const result = await response.json();
      if (!response.ok || !result?.entity?.id) throw new Error(result?.error || "Could not create host.");
      const entity = { id: result.entity.id, displayName: result.entity.displayName };
      setPayload((current) => current ? { ...current, options: { ...current.options, entities: [...current.options.entities, entity].sort((a, b) => a.displayName.localeCompare(b.displayName)) } } : current);
      const key = `hosts.${hostRole}`;
      const currentIds = Array.isArray(effective(key)) ? effective(key) as string[] : [];
      setEdit(key, [...currentIds, entity.id]);
      setHostName(""); setCreateHost(false); setHostQuery("");
    } catch (e) { setHostError(e instanceof Error ? e.message : "Could not create host."); }
  }

  const sorted = useMemo(() => [...(payload?.sessions ?? [])].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()), [payload]);

  return <section className="sc-root" aria-label="Event dates">
    <style jsx>{`
      .sc-root { margin-top: 18px; color:#332a24; }
      .sc-header { display:flex; justify-content:space-between; align-items:end; gap:14px; margin-bottom:12px; }
      .sc-header h3 { font: 500 20px/1.2 var(--font-heading, Georgia,serif); margin:0; color:#2e241e; }
      .sc-header p { margin:5px 0 0; color:#776a60; font-size:13px; line-height:1.5; max-width:560px; }
      .sc-list { display:grid; gap:9px; }
      .sc-card { display:grid; grid-template-columns:68px minmax(0,1fr) auto; align-items:center; gap:13px; background:#fffdfa; border:1px solid #e7ddd2; border-radius:12px; padding:11px 13px; }
      .sc-poster { width:68px; height:72px; border-radius:8px; overflow:hidden; background:#f2ede6; display:grid; place-items:center; }
      .sc-poster :global(img) { width:100%; height:100%; object-fit:contain; }
      .sc-meta { min-width:0; }
      .sc-meta strong { display:block; overflow-wrap:anywhere; color:#332a24; font-size:14px; }
      .sc-meta p { margin:4px 0 0; color:#74675d; font-size:12px; line-height:1.45; }
       .sc-status { color:#5c534b; font-size:12px; overflow-wrap:anywhere; margin-top:4px; }
      .sc-edit { border:1px solid #9c573f; background:#9c573f; color:#fffaf5; border-radius:8px; padding:10px 13px; font-family:var(--font-body,sans-serif); font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
      .sc-edit:hover { background:#81432f; }
      .sc-empty { border:1px dashed #d8cbbd; border-radius:12px; padding:22px; text-align:center; color:#776a60; font-size:14px; background:#fffdfa; }
      .sc-backdrop { position:fixed; z-index:300; inset:0; background:rgba(40,31,25,.38); display:flex; justify-content:flex-end; }
       .sc-sheet { width:min(760px, 100%); height:100%; overflow:auto; min-width:0; background:#fbf8f2; box-shadow:-18px 0 54px rgba(48,34,26,.16); padding:0; }
      .sc-sheet-header { position:sticky; top:0; z-index:3; background:rgba(251,248,242,.96); backdrop-filter:blur(10px); border-bottom:1px solid #e5dacf; padding:17px 22px 13px; }
      .sc-headrow { display:flex; justify-content:space-between; align-items:start; gap:12px; }
      .sc-sheet-header h3 { margin:0; font:500 24px/1.15 var(--font-heading, Georgia,serif); color:#332a24; }
      .sc-sheet-header p { margin:6px 0 0; color:#76695f; font-size:13px; }
      .sc-x { border:1px solid #ded2c7; background:#fffdfa; color:#493c33; border-radius:50%; width:38px; height:38px; font-size:22px; cursor:pointer; flex:0 0 auto; }
      .sc-body { padding:16px 22px 100px; display:grid; gap:12px; }
      .sc-section { background:#fffdfa; border:1px solid #e8ded4; border-radius:12px; padding:14px; min-width:0; }
      .sc-section h4 { font-family:var(--font-body,sans-serif); font-size:15px; line-height:1.3; font-weight:650; margin:0 0 11px; color:#46382e; }
      .sc-field { display:grid; gap:5px; min-width:0; margin-bottom:11px; font-size:12px; font-weight:650; color:#5e5148; }
      .sc-field:last-child { margin-bottom:0; }
      .sc-field input, .sc-field textarea, .sc-field select { ${Object.entries(input).map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value};`).join("")} }
      .sc-field input[type="checkbox"] { width:auto; }
      .sc-field textarea { resize:vertical; min-height:88px; }
      .sc-value { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:7px; color:#81756c; font-size:11px; font-weight:400; }
      .sc-label { display:grid; gap:5px; }
      .sc-locales { display:flex; gap:6px; margin:0 0 12px; }
      .sc-locales button { ${Object.entries(smallButton).map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value};`).join("")} }
      .sc-locales button[aria-selected="true"] { color:#7e3d2c; border-color:#a15c43; background:#f7eee7; }
      .sc-bottom { position:fixed; z-index:4; bottom:0; right:0; width:min(760px,100%); box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 22px; border-top:1px solid #e4d8cc; background:rgba(251,248,242,.97); }
      .sc-save { border:0; border-radius:9px; color:white; background:#8f4b35; padding:12px 20px; min-width:130px; font-weight:700; cursor:pointer; }
      .sc-save:disabled { opacity:.58; cursor:wait; }
      .sc-alert { font-size:13px; line-height:1.45; color:#944538; }
       .sc-preview { font-size:12px; color:#5e5148; overflow-wrap:anywhere; }
      .sc-preview ul { margin:4px 0; padding-left:18px; }
      .sc-inline { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .sc-create { margin-top:10px; padding:12px; border:1px solid #e5dacf; border-radius:9px; background:#faf6f0; }
      .sc-host-results { max-height:150px; overflow:auto; border:1px solid #e7ddd2; border-radius:8px; margin-top:7px; }
      .sc-host-option { display:flex; width:100%; justify-content:space-between; padding:9px 10px; border:0; border-bottom:1px solid #eee7df; background:#fffdfa; color:#443a32; text-align:left; cursor:pointer; }
      .sc-host-option[aria-pressed="true"] { background:#f7eee7; color:#7f3f2e; }
      .sc-artwork-preview { width:100%; height:150px; background:#f5f0e9; border-radius:9px; overflow:hidden; display:flex; justify-content:center; align-items:center; margin:8px 0 12px; }
      .sc-artwork-preview :global(img) { max-width:100%; max-height:100%; object-fit:contain; }
      .sc-focus :focus-visible { outline:3px solid #a8563e; outline-offset:2px; }
      @media(min-width:900px) { .sc-sheet { width:min(760px, calc(100vw - 320px)); } .sc-bottom { width:min(760px, calc(100vw - 320px)); } }
      @media(max-width:767px) {
        .sc-header { align-items:start; }
        .sc-card { grid-template-columns:54px minmax(0,1fr); gap:10px; padding:10px; }
        .sc-poster { width:54px; height:62px; }
        .sc-card > .sc-edit { grid-column:1 / -1; width:100%; }
        .sc-sheet { width:100%; }
        .sc-sheet-header { padding:14px 15px 12px; }
        .sc-sheet-header h3 { font-size:22px; }
        .sc-body { padding:12px 14px 100px; }
        .sc-section { padding:12px; }
        .sc-bottom { padding:10px 14px calc(10px + env(safe-area-inset-bottom)); }
      }
    `}</style>
    <div className="sc-header">
      <div><h3>Event dates</h3><p>Edit one occurrence at a time. Series details stay in place unless you change a field for this date.</p></div>
    </div>
    {loading ? <div aria-label="Loading event dates" className="sc-list">{[1, 2].map((item) => <div key={item} style={{ height: 88, borderRadius: 12, background: "#f1ece6" }} />)}</div>
      : loadError ? <div role="alert" className="sc-empty">{loadError} <button type="button" className="btn btn-ghost" onClick={() => void load()}>Retry</button></div>
      : sorted.length === 0 ? <div className="sc-empty">No event dates yet. Create the first date above.</div>
      : <div className="sc-list">{sorted.map((session) => {
        const source = sessions.find((item) => item.id === session.id);
         const flyer = session.fields["artwork.en"];
         const candidates = flyer ? (typeof flyer.value === "string" ? [flyer.value] : []) : source ? sessionArtworkCandidates(source, "en") : [];
        return <article className="sc-card" key={session.id}>
           <div className="sc-poster">{candidates.length ? <EventArtwork candidates={candidates} alt="" /> : <span aria-hidden="true" style={{ color: "#95877b", fontSize: 11 }}>No flyer</span>}</div>
          <div className="sc-meta">
             <strong>{String(session.fields["content.title.en"]?.value ?? session.title) || "Event session"}</strong>
             {(session.fields["content.subtitle.en"]?.value ?? source?.subtitle) ? <p>{String(session.fields["content.subtitle.en"]?.value ?? source?.subtitle)}</p> : null}
            <p>{prettyDate(session.startsAt, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}–{prettyDate(session.endsAt, { hour: "numeric", minute: "2-digit" })} · Panama</p>
             <div className="sc-status">{session.status} · Capacity {String(session.fields.capacity?.value ?? "—")} · {session.inventory.sold} sold</div>
          </div>
           <button type="button" className="sc-edit" data-edit-session={session.id} onClick={(event) => openEditor(session.id, event.currentTarget)}>Edit Session</button>
        </article>;
      })}</div>}

    {active && draft && <div className="sc-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
      <div className="sc-sheet sc-focus" data-session-sheet role="dialog" aria-modal="true" aria-labelledby="sc-session-title">
        <header className="sc-sheet-header">
          <div className="sc-headrow"><div><h3 id="sc-session-title">{active.title || "Event session"}</h3><p>{prettyDate(active.startsAt, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · one date only</p></div><button ref={closeRef} className="sc-x" type="button" aria-label="Close session editor" onClick={() => closeEditor()}>×</button></div>
        </header>
        <div className="sc-body">
          <aside className="sc-section sc-preview" aria-live="polite" aria-label="Effective values preview">
            <strong>Effective values for this date</strong>
            {Object.entries(draft.edits).length || draft.schedule.startsAt !== panamaDateTimeLocalInput(new Date(active.startsAt)) || draft.schedule.endsAt !== panamaDateTimeLocalInput(new Date(active.endsAt))
              ? <ul>{[
                 ...Object.entries(draft.edits).map(([key, edit]) => `${fieldLabel(key)}: ${displayValue(key, edit.mode === "clear" ? null : edit.mode === "inherit" ? payload?.defaults[key]?.value ?? null : edit.value)}`),
                ...(draft.schedule.startsAt !== panamaDateTimeLocalInput(new Date(active.startsAt)) || draft.schedule.endsAt !== panamaDateTimeLocalInput(new Date(active.endsAt))
                  ? [`Schedule: ${draft.schedule.startsAt.replace("T", " ")} – ${draft.schedule.endsAt.replace("T", " ")} (Panama)`] : []),
              ].map((row) => <li key={row}>{row}</li>)}</ul>
              : <p style={{ margin: "5px 0 0", color: "#776a60" }}>Current details for this date will be kept.</p>}
          </aside>
          <section className="sc-section">
            <h4>Details</h4>
             <p className="sc-value">Enter text once in English. Spanish and Portuguese are generated automatically after saving; guests see English while translations are pending.</p>
            {(["title", "subtitle", "description"] as const).map((name) => {
               const key = fieldKey(`content.${name}`, "en");
              const val = effective(key);
              return <label className="sc-field" key={key}>{labels[`content.${name}`]}
                {name === "description" ? <textarea rows={4} maxLength={5000} value={String(val ?? "")} onChange={(event) => setEdit(key, event.target.value)} /> : <input maxLength={name === "subtitle" ? 240 : 160} value={String(val ?? "")} onChange={(event) => setEdit(key, event.target.value)} />}
                <span className="sc-value"><span>{sourceLabel(key)}</span>{resetControl(key)}</span>
              </label>;
            })}
          </section>
          <section className="sc-section">
            <h4>Schedule &amp; capacity</h4>
            <label className="sc-field">Starts (Panama time)<input required type="datetime-local" value={draft.schedule.startsAt} onChange={(event) => { setDraft((current) => current ? { ...current, schedule: { ...current.schedule, startsAt: event.target.value } } : current); setReturnedPreview(null); setRetryPreview(null); }} /></label>
            <label className="sc-field">Ends (Panama time)<input required type="datetime-local" min={draft.schedule.startsAt} value={draft.schedule.endsAt} onChange={(event) => { setDraft((current) => current ? { ...current, schedule: { ...current.schedule, endsAt: event.target.value } } : current); setReturnedPreview(null); setRetryPreview(null); }} /></label>
            <label className="sc-field">Capacity<input type="number" min={active.inventory.minimum} max={100000} value={String(effective("capacity") ?? "")} onChange={(event) => setEdit("capacity", Number(event.target.value))} /></label>
            <p className="sc-value">At least {active.inventory.minimum} seats are already sold, held, or issued.</p>
             {draft.postponement && (draft.schedule.startsAt !== panamaDateTimeLocalInput(new Date(active.startsAt)) || draft.schedule.endsAt !== panamaDateTimeLocalInput(new Date(active.endsAt))) && <div className="sc-create">
              <strong>Ticket history needs a deliberate date change</strong>
              <label className="sc-field" style={{ marginTop: 10 }}>Reason<textarea required maxLength={1000} value={draft.postponement.reason} onChange={(event) => { setDraft((current) => current ? { ...current, postponement: { ...current.postponement!, reason: event.target.value } } : current); setRetryPreview(null); }} /></label>
              <label className="sc-field">Admission treatment<select value={draft.postponement.treatment} onChange={(event) => { setDraft((current) => current ? { ...current, postponement: { ...current.postponement!, treatment: event.target.value as "PRESERVE_ADMISSION" | "HOLD_PENDING_DATE" } } : current); setRetryPreview(null); }}><option value="PRESERVE_ADMISSION">Keep existing admission for the new date</option><option value="HOLD_PENDING_DATE">Hold admission until a new date is confirmed</option></select></label>
            </div>}
          </section>
          <section className="sc-section">
            <h4>Tickets</h4>
            {payload?.options.tickets.length ? payload.options.tickets.map((ticket) => {
              const enabledKey = `ticket.${ticket.id}.enabled`, priceKey = `ticket.${ticket.id}.price`;
              return <div key={ticket.id} style={{ borderTop: "1px solid #eee6de", paddingTop: 10, marginTop: 10 }}>
                <strong style={{ fontSize: 13 }}>{ticket.name}</strong>
                <label className="sc-field" style={{ display: "flex", flexDirection: "row", alignItems: "center", marginTop: 8 }}><input type="checkbox" disabled={!canManageRestricted} checked={Boolean(effective(enabledKey))} onChange={(event) => setEdit(enabledKey, event.target.checked)} /> Available for this date</label>
                {resetControl(enabledKey)}
                <label className="sc-field" style={{ marginTop: 8 }}>Price (cents)<input type="number" min="0" disabled={!canManageRestricted} value={String(effective(priceKey) ?? "")} onChange={(event) => setEdit(priceKey, Number(event.target.value))} /></label>{resetControl(priceKey)}
              </div>;
            }) : <p className="sc-value">No ticket types are configured for this series.</p>}
             {canManageRestricted && ["giftBagEnabled", "streetsideEnabled", "allowLateSales"].filter((key) => payload?.fields.includes(key)).map((key) =>
               <label className="sc-field" key={key} style={{ display: "flex", flexDirection: "row", alignItems: "center", marginTop: 12 }}>
                 <input type="checkbox" checked={Boolean(effective(key))} onChange={(event) => setEdit(key, event.target.checked)} />{labels[key]}
               </label>)}
          </section>
          <section className="sc-section">
            <h4>Artwork</h4>
             <div className="sc-locales" role="tablist" aria-label="Artwork language">
               {locales.map((item) => <button key={item} type="button" role="tab" aria-selected={locale === item} onClick={() => setLocale(item)}>{item.toUpperCase()}</button>)}
             </div>
            {locales.map((item) => {
              const key = `artwork.${item}`;
              const value = String(effective(key) ?? "");
              return <div key={key} hidden={locale !== item}>
                <div className="sc-artwork-preview">{value ? <EventArtwork candidates={[value]} alt={`${item.toUpperCase()} flyer preview`} /> : <span style={{ color: "#8c7f74", fontSize: 12 }}>No flyer for {item.toUpperCase()}</span>}</div>
                {canManageRestricted ? <>
                   <MediaUpload label={`${item.toUpperCase()} flyer`} value={value} onChange={(url) => setEdit(key, url)} uploadEndpoint="/api/v1/admin/event-artwork/upload" mediaType="image" accept="image/jpeg,image/png,image/webp,image/gif" hint="JPG, PNG, WEBP or GIF · max 10 MB. Portrait 3:4 preview; the full image is preserved." aspectRatio="portrait" maxSizeMB={10} imageFit="contain" compact />
                  {value && <button type="button" style={{ ...smallButton, marginTop: 8 }} onClick={() => setEdit(key, "")}>Remove this flyer</button>}
                </> : <p className="sc-value">Artwork changes require additional access.</p>}
                <div className="sc-value"><span>{sourceLabel(key)}</span>{resetControl(key)}</div>
              </div>;
            })}
             <p className="sc-value">Flyer files remain independent for English, Spanish and Portuguese. Artwork is never sent for text translation.</p>
          </section>
          <section className="sc-section">
            <h4>Hosts</h4>
            {roles.map((role) => {
              const key = `hosts.${role}`;
              const selected = Array.isArray(effective(key)) ? effective(key) as string[] : [];
              const matched = (payload?.options.entities ?? []).filter((entity) => entity.displayName.toLowerCase().includes(hostQuery.toLowerCase()));
              return <div key={role} style={{ marginBottom: 14 }}>
                <div className="sc-inline"><strong style={{ fontSize: 13, flex: 1 }}>{role.replaceAll("_", " ")}</strong>{resetControl(key)}</div>
                <label className="sc-field" style={{ marginTop: 7 }}>Search hosts<input type="search" value={hostRole === role ? hostQuery : ""} onFocus={() => setHostRole(role)} onChange={(event) => { setHostRole(role); setHostQuery(event.target.value); }} placeholder="Find a host" /></label>
                <div className="sc-host-results" role="group" aria-label={`${role.replaceAll("_", " ")} choices`}>
                  <button type="button" className="sc-host-option" onClick={() => { setHostRole(role); setCreateHost(true); }}><strong>+ Create Host</strong><span>New entity</span></button>
                  {matched.map((entity) => <button type="button" key={entity.id} className="sc-host-option" aria-pressed={selected.includes(entity.id)} onClick={() => setEdit(key, selected.includes(entity.id) ? selected.filter((id) => id !== entity.id) : [...selected, entity.id])}>{entity.displayName}<span>{selected.includes(entity.id) ? "Selected" : "Add"}</span></button>)}
                  {!matched.length && <p style={{ margin: 0, padding: 10, color: "#776a60", fontSize: 12 }}>No hosts match this search.</p>}
                </div>
                {createHost && hostRole === role && <form className="sc-create" onSubmit={createHostEntity}>
                  <strong>Create a host entity</strong>
                  <label className="sc-field" style={{ marginTop: 8 }}>Name<input required maxLength={160} value={hostName} onChange={(event) => setHostName(event.target.value)} /></label>
                  <label className="sc-field">Type<select value={hostType} onChange={(event) => setHostType(event.target.value as "PERSON" | "COMPANY")}><option value="PERSON">Person</option><option value="COMPANY">Company</option></select></label>
                  {hostError && <p role="alert" className="sc-alert">{hostError}</p>}
                  <div className="sc-inline"><button type="submit" style={smallButton}>Create and add</button><button type="button" style={smallButton} onClick={() => setCreateHost(false)}>Cancel</button></div>
                </form>}
                <p className="sc-value">{sourceLabel(key)}</p>
              </div>;
            })}
            {canManageRestricted && profileRoles.map((role) => {
              const key = `profiles.${role}`;
              const selected = Array.isArray(effective(key)) ? effective(key) as string[] : [];
              return <label key={key} className="sc-field">{role.replaceAll("_", " ")} profiles
                <select multiple value={selected} onChange={(event) => setEdit(key, Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>
                  {(payload?.options.profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
                </select><span className="sc-value">{sourceLabel(key)}{resetControl(key)}</span>
              </label>;
            })}
          </section>
          <section className="sc-section">
            <h4>Sponsors</h4>
            {(() => {
              const key = "sponsors";
              const sponsors = Array.isArray(effective(key)) ? effective(key) as Array<{ entityId: string; tierId: string; showOnEventPage: boolean; showOnTicket: boolean; showOnEmail: boolean; showOnCheckInView: boolean }> : [];
              const changeSponsors = (next: typeof sponsors) => setEdit(key, next);
              return <>
                {sponsors.map((sponsor, index) => <div key={`${sponsor.entityId}-${index}`} style={{ borderTop: "1px solid #eee6de", paddingTop: 10, marginTop: 10 }}>
                  <label className="sc-field">Sponsor<select value={sponsor.entityId} onChange={(event) => changeSponsors(sponsors.map((row, i) => i === index ? { ...row, entityId: event.target.value } : row))}><option value="">Choose sponsor</option>{payload?.options.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select></label>
                  <label className="sc-field">Tier<select value={sponsor.tierId} onChange={(event) => changeSponsors(sponsors.map((row, i) => i === index ? { ...row, tierId: event.target.value } : row))}><option value="">Choose tier</option>{payload?.options.sponsorTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.label}</option>)}</select></label>
                  {(["showOnEventPage", "showOnTicket", "showOnEmail", "showOnCheckInView"] as const).map((flag) => <label key={flag} style={{ display: "block", fontSize: 12, padding: "3px 0" }}><input type="checkbox" checked={sponsor[flag]} onChange={(event) => changeSponsors(sponsors.map((row, i) => i === index ? { ...row, [flag]: event.target.checked } : row))} /> {flag === "showOnEventPage" ? "Event page" : flag === "showOnTicket" ? "Ticket" : flag === "showOnEmail" ? "Email" : "Check-in view"}</label>)}
                  <button type="button" style={smallButton} onClick={() => changeSponsors(sponsors.filter((_, i) => i !== index))}>Remove sponsor</button>
                </div>)}
                <div className="sc-inline" style={{ marginTop: 10 }}><button type="button" style={smallButton} onClick={() => changeSponsors([...sponsors, { entityId: "", tierId: "", showOnEventPage: true, showOnTicket: true, showOnEmail: true, showOnCheckInView: false }])}>Add sponsor</button>{resetControl(key)}</div>
                <p className="sc-value">{sourceLabel(key)}. Reset to use series sponsors.</p>
              </>;
            })()}
          </section>
          {error && <div role="alert" className="sc-alert">{error}</div>}
          {returnedPreview && <aside className="sc-section sc-preview" aria-label="Effective changes preview"><strong>Effective changes for this date</strong><ul>{returnedPreview.targets.flatMap((target) => target.changes.map((change, index) => <li key={`${change.field}-${index}`}>{fieldLabel(change.field)}: {JSON.stringify(change.before.value ?? null)} → {JSON.stringify(change.after.value ?? null)}</li>))}</ul>{returnedPreview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</aside>}
        </div>
        <footer className="sc-bottom">
          <div aria-live="polite" className={error ? "sc-alert" : "sc-preview"}>{error || notice || (dirty ? "Unsaved changes" : "No unsaved changes")}
            {scheduleProtected && Object.keys(draft.edits).length > 0 && <div style={{ marginTop: 5 }}><button type="button" style={{ ...smallButton, padding: "5px 8px", fontSize: 11 }} disabled={busy} onClick={() => {
              const detailsOnly = { ...draft, schedule: { startsAt: panamaDateTimeLocalInput(new Date(active.startsAt)), endsAt: panamaDateTimeLocalInput(new Date(active.endsAt)) }, postponement: null };
              setDraft(detailsOnly); setScheduleProtected(false); void save(detailsOnly);
            }}>Keep date unchanged and save details</button></div>}
          </div>
          <button type="button" className="sc-save" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </footer>
      </div>
    </div>}
  </section>;
}
