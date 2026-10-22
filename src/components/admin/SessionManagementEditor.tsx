"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import { panamaDateTimeLocalInput, panamaDateTimeLocalIso, PANAMA_TIME_ZONE } from "@/lib/panamaDateTime";
import MediaUpload from "@/components/ui/MediaUpload";
import CurrencyAmountInput from "@/components/admin/CurrencyAmountInput";
import SeriesTranslationStatus from "@/components/admin/SeriesTranslationStatus";
import { useSeriesTranslations } from "@/components/admin/useSeriesTranslations";
import { sponsorValue } from "@/server/series/sessionFields";

type Mode = "inherit" | "override" | "clear";
type Effective = { value: unknown; source: string; mode: Mode };
type Session = {
  id: string; title: string; startsAt: string; endsAt: string; status: string;
  inventory: { sold: number; held: number; issued: number; minimum: number };
  hasTicketHistory?: boolean;
  fields: Record<string, Effective>;
};
type Options = {
  tickets: { id: string; name: string }[];
  entities: { id: string; displayName: string }[];
  profiles: { id: string; displayName: string }[];
  sponsorTiers: { id: string; label: string }[];
  referrals: { id: string; scopeType: string; scopeId: string; isCommissionEligible: boolean; status: string; isActive: boolean; actorName: string; actorStatus: string }[];
};
type Payload = { fields: string[]; sessions: Session[]; defaults: Record<string, Effective>; options: Options };
type Edit = { mode: Mode; value: unknown };
type ScheduleTemplate = { localStart: string; durationMinutes: number };
type SponsorEdit = import("zod").infer<typeof sponsorValue>[number];
type Preview = {
  previewId: string; requestId: string; targets: Array<{
    id: string; title: string; inventory: Session["inventory"];
    changes: Array<{ field: string; before: Effective; after: Effective }>;
    warnings: string[]; blocked: string[];
    noticeCounts: { queued: number; missingContacts: number; locales: { en: number; es: number; pt: number } };
  }>;
  defaults?: Array<{ field: string; before: Effective; after: Effective }>;
  blocked: string[]; warnings: string[]; expiresAt: string;
};

const roles = ["PRIMARY_HOST", "CO_HOST", "SPONSOR", "BRAND_PARTNER"];
const profileRoles = ["HOST", "CO_HOST", "MC", "PRESENTER", "PARTNER", "SPONSOR", "CURATOR", "REFERRER_ORG"];
const locales = ["en", "es", "pt"];
const textStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d9d0c7", borderRadius: 7, padding: "9px 10px", background: "#fffefa", color: "#27211d", font: "inherit" };
const cardStyle: React.CSSProperties = { border: "1px solid #e7ddd2", background: "#fffdfa", borderRadius: 10, padding: 14 };
const nice = (key: string) => key.replaceAll(".", " · ").replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
function fieldLabel(key: string, tr: (key: string, fallback: string) => string, referrals: Options["referrals"] = []) {
  if (key === "capacity") return tr("session_field_capacity", "Capacity");
  if (key === "schedule") return tr("session_field_schedule", "Schedule template");
  if (key === "giftBagEnabled") return tr("session_field_gift_bag", "Gift bag");
  if (key === "streetsideEnabled") return tr("session_field_streetside", "Streetside");
  if (key === "allowLateSales") return tr("session_field_late_sales", "Late sales");
  if (key === "sponsors") return tr("session_field_sponsors", "Sponsors");
  const parts = key.split(".");
  if (parts[0] === "content" && parts.length === 3) return `${tr(`session_field_${parts[1]}`, nice(parts[1]))} · ${parts[2].toUpperCase()}`;
  if (parts[0] === "artwork" && parts.length === 2) return `${tr("session_field_artwork", "Artwork")} · ${parts[1].toUpperCase()}`;
  if (parts[0] === "ticket" && parts.length === 3) return `${tr("session_field_ticket", "Ticket")} ${parts[1]} · ${parts[2] === "price" ? tr("session_field_price", "Price") : tr("session_field_enabled", "Enabled")}`;
  if ((parts[0] === "hosts" || parts[0] === "profiles") && parts.length === 2) return tr(`session_role_${parts[1].toLowerCase()}`, nice(parts[1]));
  if (parts[0] === "referral" && parts.length === 3 && parts[2] === "status") {
    const item = referrals.find((referral) => referral.id === parts[1]);
    return `${tr("session_referral_assignment", "Referral assignment")}${item ? ` · ${item.actorName || item.id}` : ` · ${parts[1]}`} · ${tr("session_status", "Status")}`;
  }
  return nice(key);
}
const valueText = (value: unknown, key?: string) => {
  if (value === null || value === undefined) return "—";
  if (key?.startsWith("ticket.") && key.endsWith(".price") && typeof value === "number") return "$" + (Math.max(0, value) / 100).toFixed(2);
  return typeof value === "string" ? value : JSON.stringify(value);
};

export default function SessionManagementEditor({ seriesId, onSaved, canManageRestricted }: { seriesId: string; onSaved: () => Promise<void> | void; canManageRestricted: boolean }) {
  const t = useTranslation();
  const tr = (key: string, fallback: string) => t("admin", key) ?? fallback;
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [kind, setKind] = useState<"sessions" | "defaults">("sessions");
  const [selected, setSelected] = useState<string[]>([]);
  const [contentLocale, setContentLocale] = useState<"en" | "es" | "pt">("en");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [referralEdits, setReferralEdits] = useState<Record<string, "DRAFT" | "ACTIVE" | "PAUSED" | "RETIRED" | "">>({});
  const [schedules, setSchedules] = useState<Record<string, { startsAt: string; endsAt: string }>>({});
  const [template, setTemplate] = useState({ localStart: "18:00", durationMinutes: 180 });
  const [postponement, setPostponement] = useState<{ reason: string; treatment: "PRESERVE_ADMISSION" | "HOLD_PENDING_DATE" } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const translations = useSeriesTranslations(seriesId);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // React may commit the preview after an animation-frame callback has fired.
  // Open and focus only once the rendered preview and enabled button exist.
  useEffect(() => {
    if (!preview || busy || !dialogRef.current) return;
    if (!dialogRef.current.open) dialogRef.current.showModal();
    confirmRef.current?.focus();
  }, [preview, busy]);

  async function load(preserveDraft = false) {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(`/api/v1/admin/series/${seriesId}/session-management`);
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || tr("session_management_load_failed", "Could not load session management."));
      setData(body.data);
      if (!preserveDraft) { setSelected([]); setEdits({}); setReferralEdits({}); setSchedules({}); }
    } catch (e) { setLoadError(e instanceof Error ? e.message : tr("session_management_load_failed", "Could not load session management.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [seriesId]);
  const sessions = data?.sessions ?? [];
  const visibleFields = useMemo(() => (data?.fields ?? []).filter((key) => !key.startsWith("content.") && !key.startsWith("artwork.") && !key.startsWith("artworkMobile.") && (canManageRestricted || !(
    key.startsWith("artwork.") || key.startsWith("ticket.") || ["giftBagEnabled", "streetsideEnabled", "allowLateSales"].includes(key) ||
    key.startsWith("profiles.")
  ))), [data, canManageRestricted]);
  const selectionState = selected.length === 0 ? "none" : selected.length === sessions.length ? "all" : "mixed";
  const triRef = (node: HTMLInputElement | null) => { if (node) node.indeterminate = selectionState === "mixed"; };
  const selectedSessions = sessions.filter((session) => selected.includes(session.id));
  const localizedKeys = (locale: string) => [
    "content.title." + locale, "content.subtitle." + locale, "content.description." + locale,
    ...(canManageRestricted ? ["artwork." + locale, ...(kind === "sessions" ? ["artworkMobile." + locale] : [])] : []),
  ].filter((key) => data?.fields.includes(key));
  const localizedEffective = (key: string) => kind === "defaults" ? data?.defaults[key] : selectedSessions[0]?.fields[key];
  function setLocalizedValue(key: string, value: unknown) { setEdit(key, { mode: "override", value }); }
  const canEditLocalized = kind === "defaults" || selectedSessions.length > 0;

  function setEdit(key: string, edit: Edit) { setEdits((prev) => ({ ...prev, [key]: edit })); }
  function modeControl(key: string) {
    const edit = edits[key];
    return <label style={{ display: "block", marginTop: 8, fontSize: 12, fontWeight: 600 }}>
      {tr("session_edit_action", "Change")}
      <select aria-label={`${fieldLabel(key, tr, data?.options.referrals)} ${tr("session_edit_action", "Change")}`} value={edit?.mode ?? ""} onChange={(e) => {
        const mode = e.target.value as Mode | "";
        if (!mode) setEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
        else setEdit(key, { mode, value: edit?.value ?? "" });
      }} style={{ ...textStyle, marginTop: 4 }}>
        <option value="">{tr("session_untouched", "Untouched")}</option>
        <option value="inherit">{tr("session_inherit", "Inherit")}</option>
        <option value="override">{tr("session_override", "Override")}</option>
        {canClear(key) && <option value="clear">{tr("session_clear", "Clear")}</option>}
      </select>
    </label>;
  }
  function canClear(key: string) { return key.startsWith("content.") || key.startsWith("artwork.") || key.startsWith("hosts.") || key.startsWith("profiles.") || key === "sponsors"; }

  function editor(key: string) {
    const edit = edits[key]; if (!edit || edit.mode !== "override") return null;
    const currentValue = edit.value;
    const update = (value: unknown) => setEdit(key, { mode: "override", value });
    if (key === "schedule") {
      const currentSchedule = currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
        ? currentValue as Partial<ScheduleTemplate>
        : {};
      return <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <label>{tr("session_local_start", "Local start time")}<input type="time" value={currentSchedule.localStart ?? template.localStart} onChange={(e) => update({ ...currentSchedule, localStart: e.target.value })} style={textStyle} /></label>
        <label>{tr("session_duration", "Duration in minutes")}<input type="number" min="1" max="10080" value={currentSchedule.durationMinutes ?? template.durationMinutes} onChange={(e) => update({ ...currentSchedule, durationMinutes: Number(e.target.value) })} style={textStyle} /></label>
        <p style={{ margin: 0, color: "#756a61", fontSize: 12 }}>{tr("session_schedule_template_note", "This is a time template only. Set occurrence dates below; no dates are inferred.")}</p>
      </div>;
    }
    if (key === "capacity") return <label>{tr("session_capacity", "Capacity")}<input type="number" min="1" max="100000" value={String(currentValue ?? "")} onChange={(e) => update(Number(e.target.value))} style={textStyle} /></label>;
    if (["giftBagEnabled", "streetsideEnabled", "allowLateSales"].includes(key) || key.endsWith(".enabled")) return <label><input type="checkbox" checked={Boolean(currentValue)} onChange={(e) => update(e.target.checked)} /> {tr("session_enabled", "Enabled")}</label>;
    if (/\.price$/.test(key)) return <CurrencyAmountInput label={tr("session_field_price", "Ticket price")} dollarsLabel={tr("session_price_dollars", "Dollars")} centsLabel={tr("session_price_cents", "Cents")} value={Number(currentValue ?? 0)} onChange={update} />;
    if (key.startsWith("hosts.") || key.startsWith("profiles.")) {
      const options = key.startsWith("hosts.") ? data?.options.entities ?? [] : data?.options.profiles ?? [];
      return <label>{fieldLabel(key, tr, data?.options.referrals)}<select multiple value={Array.isArray(currentValue) ? currentValue.map(String) : []} onChange={(e) => update(Array.from(e.target.selectedOptions, (o) => o.value))} style={{ ...textStyle, minHeight: 90 }}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.displayName}</option>)}
      </select><small>{tr("session_multi_select_hint", "Use Ctrl or Command to select multiple.")}</small></label>;
    }
    if (key === "sponsors") {
      const parsedSponsors = sponsorValue.safeParse(currentValue);
      return <SponsorEditor value={parsedSponsors.success ? parsedSponsors.data : []} data={data} onChange={update} t={tr} />;
    }
    if (key.startsWith("content.")) return key.includes("description")
      ? <textarea aria-label={fieldLabel(key, tr, data?.options.referrals)} rows={3} maxLength={5000} value={String(currentValue ?? "")} onChange={(e) => update(e.target.value)} style={textStyle} />
      : <input aria-label={fieldLabel(key, tr, data?.options.referrals)} maxLength={key.includes("subtitle") ? 240 : 160} value={String(currentValue ?? "")} onChange={(e) => update(e.target.value)} style={textStyle} />;
    if (key.startsWith("artwork.")) return <input aria-label={fieldLabel(key, tr, data?.options.referrals)} type="url" inputMode="url" value={String(currentValue ?? "")} onChange={(e) => update(e.target.value)} style={textStyle} />;
    return <textarea aria-label={fieldLabel(key, tr, data?.options.referrals)} rows={2} value={typeof currentValue === "string" ? currentValue : JSON.stringify(currentValue ?? "")} onChange={(e) => { try { update(JSON.parse(e.target.value)); } catch { update(e.target.value); } }} style={textStyle} />;
  }

  function toggleAll() { setSelected(selectionState === "all" ? [] : sessions.map((s) => s.id)); }
  async function makePreview() {
    setError(""); setSuccess("");
    if (kind === "sessions" && selected.length === 0) { setError(tr("session_select_first", "Select at least one session.")); return; }
    const assignmentChanges = kind === "defaults" ? Object.entries(referralEdits)
      .filter(([assignmentId, status]) => status && data?.options.referrals.find((item) => item.id === assignmentId)?.status !== status)
      .map(([assignmentId, status]) => ({ assignmentId, status: status as "DRAFT" | "ACTIVE" | "PAUSED" | "RETIRED" })) : [];
    const scheduleValues: Record<string, { startsAt: string; endsAt: string }> = {};
    Object.entries(schedules).forEach(([id, value]) => {
      if (kind === "sessions" && selected.includes(id) && value.startsAt && value.endsAt) scheduleValues[id] = { startsAt: panamaDateTimeLocalIso(value.startsAt), endsAt: panamaDateTimeLocalIso(value.endsAt) };
    });
    const validPostponement = kind === "sessions" && postponement && postponement.reason.trim().length > 0 && ["PRESERVE_ADMISSION", "HOLD_PENDING_DATE"].includes(postponement.treatment);
    if (!Object.keys(edits).length && assignmentChanges.length === 0 && Object.keys(scheduleValues).length === 0 && !validPostponement) { setError(tr("session_choose_change", "Choose at least one field change.")); return; }
    setBusy(true);
    try {
      const patch = Object.fromEntries(Object.entries(edits).map(([key, edit]) => [key, edit.mode === "override" ? { mode: edit.mode, value: key === "schedule" ? { ...template, ...(edit.value as object) } : edit.value } : { mode: edit.mode }]));
       const body: Record<string, unknown> = { kind, sessionIds: kind === "sessions" ? selected : [], patch };
       if (kind === "defaults" && assignmentChanges.length) body.assignmentChanges = assignmentChanges;
      if (kind === "sessions" && Object.keys(scheduleValues).length) body.schedules = scheduleValues;
      if (kind === "sessions" && postponement) body.postponement = postponement;
      const response = await fetch(`/api/v1/admin/series/${seriesId}/session-management`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result?.ok) throw Object.assign(new Error(result?.error || tr("session_preview_failed", "Preview could not be created.")), { status: response.status });
      const nextPreview = result.data as Preview;
      const contentOnly = Object.keys(edits).length > 0 &&
        Object.keys(edits).every((key) => (key.startsWith("content.") || key.startsWith("artwork.")) && edits[key]?.mode === "override") &&
        Object.keys(scheduleValues).length === 0 && assignmentChanges.length === 0 && !validPostponement &&
        nextPreview.blocked.length === 0 && nextPreview.warnings.length === 0 &&
        nextPreview.targets.every((target) => target.blocked.length === 0 && target.warnings.length === 0);
      if (contentOnly) await commit(nextPreview);
      else setPreview(nextPreview);
    } catch (e) { setError(e instanceof Error ? e.message : tr("session_preview_failed", "Preview could not be created.")); }
    finally { setBusy(false); }
  }
  async function commit(candidate: Preview | null = preview) {
    if (!candidate) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/admin/series/${seriesId}/session-management`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewId: candidate.previewId, requestId: candidate.requestId }) });
      const result = await response.json();
      if (!response.ok || !result?.ok) {
        if (response.status === 409) { setPreview(null); dialogRef.current?.close(); setError(tr("session_preview_stale", "The preview is stale. Your draft is preserved; review fresh data and preview again.")); await load(true); }
        else throw new Error(result?.error || tr("session_save_failed", "Could not apply changes."));
        return;
      }
      const translation = await translations.onSave(result);
      setPreview(null); dialogRef.current?.close(); setEdits({}); setReferralEdits({}); setSchedules({}); setSelected([]);
      setSuccess(translation?.state === "ready" ? "Saved / translations ready." : translation?.state === "retry" ? "Saved / translation needs retry." : "Saved / translation pending.");
      await onSaved(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : tr("session_save_failed", "Could not apply changes.")); }
    finally { setBusy(false); }
  }
  const defaultsAffected = Object.entries(data?.defaults ?? {}).filter(([key]) => edits[key]);

  return <section aria-labelledby="session-management-title" style={{ ...cardStyle, margin: "0 0 24px", borderColor: "#dbc9b6", boxShadow: "0 3px 14px rgba(71,51,32,.04)" }}>
    <div style={{ borderLeft: "3px solid #9f4d36", paddingLeft: 12, marginBottom: 16 }}>
      <p style={{ color: "#9f4d36", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", margin: "0 0 5px", textTransform: "uppercase" }}>{tr("session_management_eyebrow", "Series operations")}</p>
      <h3 id="session-management-title" style={{ color: "#27211d", fontSize: 20, margin: 0 }}>{tr("session_management_title", "Session management")}</h3>
      <p style={{ color: "#70665e", fontSize: 13, lineHeight: 1.55, margin: "6px 0 0" }}>{tr("session_management_intro", "Stage targeted changes, inspect their impact, then apply them. Untouched fields are never sent.")}</p>
    </div>
    <div aria-live="polite" role={error ? "alert" : "status"} style={{ color: error ? "#9d3028" : "#315a43", marginBottom: error || success ? 12 : 0 }}>{error || success}</div>
    <SeriesTranslationStatus translation={translations.translation} loading={translations.loading} working={translations.working} error={translations.error} onResume={translations.resume} onRetry={translations.retry} onRefresh={translations.refresh} />
    {loading ? <div aria-label={tr("loading", "Loading")} style={{ display: "grid", gap: 8 }}><div style={{ height: 36, borderRadius: 7, background: "#f1ece6" }} /><div style={{ height: 64, borderRadius: 7, background: "#f1ece6" }} /></div>
      : loadError ? <div role="alert">{loadError} <button type="button" onClick={() => void load()} className="btn btn-ghost">{tr("retry", "Retry")}</button></div>
      : data ? <>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ fontWeight: 650 }}>{tr("session_change_scope", "Change scope")}
            <select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setSelected([]); setSchedules({}); }} style={{ ...textStyle, marginTop: 5 }}>
              <option value="sessions">{tr("session_scope_selected", "Selected sessions")}</option>
              <option value="defaults">{tr("session_scope_defaults", "Series defaults (inheriting sessions)")}</option>
            </select>
          </label>
          {kind === "sessions" && <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontWeight: 650, marginBottom: 8 }}>{tr("session_targets", "Sessions")}</legend>
            <label style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input ref={triRef} type="checkbox" checked={selectionState === "all"} onChange={toggleAll} aria-checked={selectionState === "mixed" ? "mixed" : selectionState === "all"} />
              <span>{tr("session_select_all", "Select all")} <small>({selected.length}/{sessions.length})</small></span>
            </label>
            {sessions.map((session) => <label key={session.id} style={{ ...cardStyle, display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 9, marginTop: 7, cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(session.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, session.id] : prev.filter((id) => id !== session.id))} aria-label={`${tr("select_session", "Select session")} ${session.title}`} />
              <span><strong>{session.title || tr("event_session", "Event session")}</strong><small style={{ display: "block", color: "#756a61" }}>{new Date(session.startsAt).toLocaleString(undefined, { timeZone: PANAMA_TIME_ZONE })} · {session.status} · {tr("sold", "Sold")} {session.inventory.sold} / {tr("held", "Held")} {session.inventory.held} / {tr("issued", "Issued")} {session.inventory.issued} / {tr("minimum", "Minimum")} {session.inventory.minimum}</small></span>
            </label>)}
          </fieldset>}
          {kind === "defaults" && <aside style={{ ...cardStyle, background: "#f7f2eb" }}>
            <strong>{tr("session_defaults_disclosure", "Affected inheriting sessions")}</strong>
            <p style={{ fontSize: 13, color: "#756a61", margin: "5px 0" }}>{tr("session_defaults_explainer", "Defaults are separate from occurrence edits. The server preview identifies each session that currently inherits these values.")}</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>{Object.keys(edits).map((key) => {
              const inheritors = sessions.filter((session) => session.fields[key]?.mode === "inherit");
              return <li key={key}><strong>{fieldLabel(key, tr, data.options.referrals)}:</strong> {inheritors.length
                ? inheritors.map((session) => session.title || session.id).join(", ")
                : tr("session_none_inheriting", "No current sessions inherit this field.")}</li>;
            })}</ul>
          </aside>}
          <section aria-labelledby="localized-session-content-title" style={{ ...cardStyle, background: "#fff", marginBottom: 12, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h4 id="localized-session-content-title" style={{ margin: 0, color: "#27211d", fontSize: 16 }}>English content &amp; localized artwork</h4>
                <p style={{ color: "#756a61", fontSize: 12, lineHeight: 1.5, margin: "5px 0 0" }}>Enter each text field once in English. Spanish and Portuguese are generated after save, with English fallback while pending. Artwork remains language-specific.</p>
              </div>
            </div>
            {canEditLocalized ? <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {selectedSessions.length > 1 && kind === "sessions" && <p role="note" style={{ color: "#735a43", fontSize: 12, margin: 0 }}>{tr("session_bulk_content_note", "Editing this language applies the same content to all selected sessions.")}</p>}
              {localizedKeys("en").filter((key) => key.startsWith("content.")).map((key) => {
                const field = localizedEffective(key);
                const edit = edits[key];
                const value = edit?.mode === "clear" ? "" : edit?.mode === "override" ? edit.value : field?.value;
                const description = key.includes("description");
                const label = fieldLabel(key, tr, data.options.referrals).replace(/ · [A-Z]{2}$/, "");
                return <label key={key} style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 650 }}>
                  {label}
                  {description
                    ? <textarea aria-label={label} rows={5} maxLength={5000} value={String(value ?? "")} onChange={(event) => setEdit(key, event.target.value ? { mode: "override", value: event.target.value } : { mode: "clear", value: undefined })} style={textStyle} />
                    : <input aria-label={label} maxLength={key.includes("subtitle") ? 240 : 160} value={String(value ?? "")} onChange={(event) => setEdit(key, event.target.value ? { mode: "override", value: event.target.value } : { mode: "clear", value: undefined })} style={textStyle} />}
                  <button type="button" className="btn btn-ghost" onClick={() => setEdit(key, { mode: "inherit", value: undefined })}>Use series details</button>
                </label>;
              })}
              {canManageRestricted && <div role="tablist" aria-label="Artwork language" style={{ display: "flex", gap: 8 }}>
                {(["en", "es", "pt"] as const).map(locale => <button key={locale} type="button" role="tab" aria-selected={contentLocale === locale} onClick={() => setContentLocale(locale)} className="btn btn-ghost">{locale.toUpperCase()}</button>)}
              </div>}
              {canManageRestricted && localizedKeys(contentLocale).some((key) => key.startsWith("artwork.")) && (() => {
                const key = "artwork." + contentLocale;
                const field = localizedEffective(key);
                const edit = edits[key];
                return <div>
                  <MediaUpload label={tr("session_field_artwork", "Session flyer")} value={String(edit?.mode === "override" ? edit.value ?? "" : field?.value ?? "")}
                    onChange={(url) => setLocalizedValue(key, url)} uploadEndpoint="/api/v1/admin/event-artwork/upload" mediaType="image" aspectRatio="portrait" maxSizeMB={10}
                    hint={tr("event_artwork_upload_hint", "Upload the flyer for this language. JPG, PNG, WEBP or GIF · max 10 MB")} />
                  <p style={{ color: "#756a61", fontSize: 11, margin: "5px 0 0" }}>{tr("session_artwork_fallback_note", "If this language has no flyer, guests see the English flyer, then the legacy image.")}</p>
                </div>;
              })()}
            </div> : <p role="note" style={{ color: "#756a61", fontSize: 13, margin: "10px 0 0" }}>{tr("session_select_first", "Select a session to edit its content.")}</p>}
          </section>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontWeight: 650, marginBottom: 8 }}>{tr("session_fields", "Other editable fields")}</legend>
            {visibleFields.map((key) => {
              const field = kind === "defaults" ? data.defaults[key] : selectedSessions[0]?.fields[key];
              const values = selectedSessions.map((session) => session.fields[key]?.value);
              const mixed = kind === "sessions" && selectedSessions.length > 1 && selectedSessions.some((session) => {
                const current = session.fields[key];
                const first = selectedSessions[0]?.fields[key];
                return JSON.stringify(current?.value) !== JSON.stringify(first?.value) || current?.source !== first?.source || current?.mode !== first?.mode;
              });
              return <div key={key} style={{ ...cardStyle, marginBottom: 8 }}>
                <strong>{fieldLabel(key, tr, data.options.referrals)}</strong>
                <p style={{ color: "#746960", fontSize: 12, margin: "4px 0" }}>{mixed ? tr("session_mixed_values", "Mixed effective values across selection") : tr("effective", "Effective") + ": " + valueText(kind === "defaults" ? field?.value : values[0], key)} · {tr("source", "Source")}: {mixed ? tr("mixed", "mixed") : field?.source ?? "—"}</p>
                {modeControl(key)}{editor(key)}
              </div>;
            })}
          </fieldset>
          {kind === "sessions" && <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontWeight: 650, marginBottom: 5 }}>{tr("session_occurrence_dates", "Occurrence dates")}</legend>
            <p style={{ color: "#756a61", fontSize: 12, marginTop: 0 }}>{tr("session_occurrence_dates_note", "Set concrete dates per selected session. A schedule template never supplies an occurrence date.")}</p>
            {selectedSessions.map((session) => <div key={session.id} style={{ ...cardStyle, display: "grid", gap: 8, marginBottom: 8 }}>
              <strong>{session.title || session.id}</strong>
              <label>{tr("starts_at", "Starts at")}<input type="datetime-local" value={schedules[session.id]?.startsAt ?? panamaDateTimeLocalInput(new Date(session.startsAt))} onChange={(e) => setSchedules((prev) => ({ ...prev, [session.id]: { startsAt: e.target.value, endsAt: prev[session.id]?.endsAt ?? panamaDateTimeLocalInput(new Date(session.endsAt)) } }))} style={textStyle} /></label>
              <label>{tr("ends_at", "Ends at")}<input type="datetime-local" min={schedules[session.id]?.startsAt} value={schedules[session.id]?.endsAt ?? panamaDateTimeLocalInput(new Date(session.endsAt))} onChange={(e) => setSchedules((prev) => ({ ...prev, [session.id]: { startsAt: prev[session.id]?.startsAt ?? panamaDateTimeLocalInput(new Date(session.startsAt)), endsAt: e.target.value } }))} style={textStyle} /></label>
            </div>)}
          </fieldset>}
          {selectedSessions.some((s) => {
            const change = schedules[s.id];
            const hasHistory = s.hasTicketHistory ?? (s.inventory.sold + s.inventory.held + s.inventory.issued > 0);
            return hasHistory && Boolean(change) &&
              (change!.startsAt !== panamaDateTimeLocalInput(new Date(s.startsAt)) || change!.endsAt !== panamaDateTimeLocalInput(new Date(s.endsAt)));
          }) && <fieldset style={{ ...cardStyle, borderColor: "#d6b891" }}>
            <legend style={{ fontWeight: 700 }}>{tr("session_postponement", "Postponement controls")}</legend>
            <label style={{ display: "flex", gap: 8, alignItems: "start" }}><input type="checkbox" checked={Boolean(postponement)} onChange={(e) => setPostponement(e.target.checked ? { reason: "", treatment: "PRESERVE_ADMISSION" } : null)} /> {tr("session_postponement_enable", "This is a deliberate postponement")}</label>
            {postponement && <>
              <label>{tr("session_postponement_reason", "Reason for postponement")}<textarea required rows={3} maxLength={1000} value={postponement.reason} onChange={(e) => setPostponement({ ...postponement, reason: e.target.value })} style={textStyle} /></label>
              <label>{tr("session_admission_treatment", "Admission treatment")}<select value={postponement.treatment} onChange={(e) => setPostponement({ ...postponement, treatment: e.target.value as typeof postponement.treatment })} style={textStyle}><option value="PRESERVE_ADMISSION">{tr("session_preserve_admission", "Preserve admission")}</option><option value="HOLD_PENDING_DATE">{tr("session_hold_admission", "Hold pending a new date")}</option></select></label>
            </>}
          </fieldset>}
          {kind === "defaults" && canManageRestricted && data.options.referrals.length > 0 && <fieldset style={{ ...cardStyle, margin: 0, minWidth: 0 }}>
            <legend style={{ fontWeight: 700 }}>{tr("session_referral_assignments", "Financial referral assignments")}</legend>
            <p style={{ color: "#756a61", fontSize: 12, lineHeight: 1.5, margin: "0 0 8px" }}>{tr("session_referral_effects", "Only canonical assignment statuses—Draft, Active, Paused, and Retired—are available. Status changes affect future bookings across this entire series; historical booking economics are unchanged. Commission rates, eligibility, scope, plans, and links cannot be changed here.")}</p>
            <div style={{ display: "grid", gap: 8 }}>
              {data.options.referrals.map((item) => {
                const isSeriesAssignment = item.scopeType === "SERIES" && item.scopeId === seriesId;
                const editable = isSeriesAssignment && ["DRAFT", "ACTIVE", "PAUSED", "RETIRED"].includes(item.status);
                const actorLabel = item.actorName || `${tr("session_referral_actor", "Referral actor")} ${item.id}`;
                return <div key={item.id} style={{ ...cardStyle, minWidth: 0, padding: 10 }}>
                  <strong>{actorLabel}</strong>
                  <p style={{ color: "#756a61", fontSize: 12, margin: "3px 0 8px", overflowWrap: "anywhere" }}>
                    {item.scopeType === "SERIES" ? tr("session_referral_series_scope", "This series") : item.scopeType === "GLOBAL" ? tr("session_referral_global_scope", "Global") : item.scopeType === "VENUE" ? tr("session_referral_venue_scope", "Venue") : item.scopeType}
                    {" · "}{tr("session_status", "Status")}: {item.status}
                    {" · "}{tr("session_referral_actor_status", "Actor")}: {item.actorStatus}
                    {" · "}{item.isCommissionEligible ? tr("commission_eligible", "Commission eligible") : tr("not_commission_eligible", "Not commission eligible")}
                  </p>
                  {editable
                    ? <label style={{ display: "block", fontSize: 12, fontWeight: 600 }}>{tr("session_referral_assignment_change", "Assignment status")}
                      <select aria-label={`${actorLabel} ${tr("session_referral_assignment_change", "Assignment status")}`} value={referralEdits[item.id] ?? ""} onChange={(event) => setReferralEdits((previous) => ({ ...previous, [item.id]: event.target.value as "DRAFT" | "ACTIVE" | "PAUSED" | "RETIRED" | "" }))} style={{ ...textStyle, marginTop: 4 }}>
                        <option value="">{tr("session_referral_unchanged", "Unchanged")}</option>
                        <option value="DRAFT">{tr("session_referral_draft", "Draft")}</option>
                        <option value="ACTIVE">{tr("session_referral_active", "Active")}</option>
                        <option value="PAUSED">{tr("session_referral_paused", "Paused")}</option>
                        <option value="RETIRED">{tr("session_referral_retired", "Retired")}</option>
                      </select>
                    </label>
                    : <p style={{ margin: 0, fontSize: 12, color: "#756a61" }}>{isSeriesAssignment ? tr("session_referral_read_only_status", "This assignment status is read-only.") : tr("session_referral_scope_read_only", "This referral scope is read-only here.")}</p>}
                </div>;
              })}
            </div>
            {data.options.referrals.some((item) => !(item.scopeType === "SERIES" && item.scopeId === seriesId && ["DRAFT", "ACTIVE", "PAUSED", "RETIRED"].includes(item.status))) && <p style={{ margin: "8px 0 0" }}>
              <Link href="/admin/referrals" style={{ color: "#8c412f" }}>{tr("session_referrers_link", "Manage referrers")}</Link>
            </p>}
          </fieldset>}
          {defaultsAffected.length > 0 && <p style={{ color: "#735a43", fontSize: 12 }}>{tr("session_defaults_change_note", "Defaults changes affect sessions inheriting each selected field; the preview lists exact targets.")}</p>}
          <button type="button" className="btn btn-primary" onClick={() => void makePreview()} disabled={busy}>{busy ? tr("session_preparing_preview", "Preparing preview…") : tr("session_preview_changes", "Preview changes")}</button>
        </div>
      </> : null}
    <dialog ref={dialogRef} aria-labelledby="session-preview-title" onClose={() => setPreview(null)} style={{ width: "min(720px, calc(100% - 24px))", maxHeight: "85dvh", overflow: "auto", border: "1px solid #d7c7b7", borderRadius: 12, padding: 18, color: "#27211d" }}>
      {preview && <>
        <h3 id="session-preview-title">{tr("session_preview_title", "Review exact changes")}</h3>
        <p>{tr("session_preview_expiry", "Preview expires")}: {new Date(preview.expiresAt).toLocaleString()}</p>
        <p><strong>{preview.targets.length}</strong> {tr("session_preview_targets", "target sessions")} · {preview.warnings.length} {tr("warnings", "warnings")} · {preview.blocked.length} {tr("blocked", "blocked")}</p>
        <section aria-labelledby="session-default-diffs-title" style={{ ...cardStyle, marginBottom: 12 }}>
          <strong id="session-default-diffs-title">{tr("session_preview_defaults", "Series default changes")}</strong>
          {preview.defaults?.length
            ? <ul>{preview.defaults.map((change, index) => <li key={`${change.field}-${index}`}><strong>{fieldLabel(change.field, tr, data?.options.referrals)}</strong>: {valueText(change.before.value, change.field)} [{change.before.source}/{change.before.mode}] → {valueText(change.after.value, change.field)} [{change.after.source}/{change.after.mode}]</li>)}</ul>
            : <p style={{ margin: "5px 0 0" }}>{tr("session_preview_no_defaults", "No series default changes in this preview.")}</p>}
        </section>
        <ul>{preview.targets.map((target) => <li key={target.id} style={{ marginBottom: 14 }}>
          <strong>{target.title}</strong>
          <p>{tr("inventory", "Inventory")}: sold {target.inventory.sold}, held {target.inventory.held}, issued {target.inventory.issued}, minimum {target.inventory.minimum}</p>
          <ul>{target.changes.map((change, index) => <li key={`${change.field}-${index}`}><strong>{fieldLabel(change.field, tr, data?.options.referrals)}</strong>: {valueText(change.before.value, change.field)} [{change.before.source}/{change.before.mode}] → {valueText(change.after.value, change.field)} [{change.after.source}/{change.after.mode}]</li>)}</ul>
          {target.warnings.map((warning, i) => <p key={`w${i}`} role="note">Warning: {warning}</p>)}{target.blocked.map((block, i) => <p key={`b${i}`} role="alert">Blocked: {block}</p>)}
          <p>{tr("notice_recipients", "Notice recipients")}: {target.noticeCounts.queued} {tr("queued", "queued")}; {target.noticeCounts.missingContacts} {tr("missing_contacts", "missing contacts")}; EN {target.noticeCounts.locales.en} / ES {target.noticeCounts.locales.es} / PT {target.noticeCounts.locales.pt}. {tr("no_contacts_shown", "No attendee contact details are shown.")}</p>
        </li>)}</ul>
        {preview.warnings.map((warning, i) => <p key={`gw${i}`}>Warning: {warning}</p>)}{preview.blocked.map((block, i) => <p role="alert" key={`gb${i}`}>Blocked: {block}</p>)}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button ref={confirmRef} type="button" className="btn btn-primary" disabled={busy || preview.blocked.length > 0 || preview.targets.some((target) => target.blocked.length > 0)} onClick={() => void commit()}>{busy ? tr("applying", "Applying…") : tr("session_confirm_apply", "Confirm and apply")}</button>
          <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>{tr("cancel", "Cancel")}</button>
        </div>
      </>}
    </dialog>
    <style jsx>{`input:focus, select:focus, textarea:focus, button:focus-visible { outline: 3px solid #a8563e; outline-offset: 2px; } @media(max-width:480px){ dialog { padding: 12px !important; } }`}</style>
  </section>;
}

function SponsorEditor({ value, data, onChange, t }: { value: SponsorEdit[]; data: Payload | null; onChange: (value: unknown) => void; t: (key: string, fallback: string) => string }) {
  const sponsors = value;
  const entities = data?.options.entities ?? [];
  const tiers = data?.options.sponsorTiers ?? [];
  return <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
    {sponsors.map((sponsor, index) => <fieldset key={index} style={{ border: "1px solid #e5ddd4", borderRadius: 7, padding: 8 }}>
      <legend>{t("session_sponsor", "Sponsor")} {index + 1}</legend>
      <label>{t("entity", "Entity")}<select value={sponsor.entityId ?? ""} onChange={(e) => onChange(sponsors.map((x, i) => i === index ? { ...x, entityId: e.target.value } : x))} style={textStyle}><option value="">—</option>{entities.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}</select></label>
      <label>{t("sponsor_tier", "Tier")}<select value={sponsor.tierId ?? ""} onChange={(e) => onChange(sponsors.map((x, i) => i === index ? { ...x, tierId: e.target.value } : x))} style={textStyle}><option value="">—</option>{tiers.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      {(["showOnEventPage", "showOnTicket", "showOnEmail", "showOnCheckInView"] as const).map((field) => <label key={field} style={{ display: "block" }}><input type="checkbox" checked={Boolean(sponsor[field])} onChange={(e) => onChange(sponsors.map((x, i) => i === index ? { ...x, [field]: e.target.checked } : x))} /> {t(`session_${field}`, field.replace("showOn", "Show on "))}</label>)}
      <button type="button" className="btn btn-ghost" onClick={() => onChange(sponsors.filter((_, i) => i !== index))}>{t("remove", "Remove")}</button>
    </fieldset>)}
    <button type="button" className="btn btn-ghost" onClick={() => onChange([...sponsors, { entityId: "", tierId: "", showOnEventPage: true, showOnTicket: true, showOnEmail: true, showOnCheckInView: false }])}>{t("session_add_sponsor", "Add sponsor")}</button>
  </div>;
}
