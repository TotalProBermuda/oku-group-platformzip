"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

type Locale = "en" | "es" | "pt";
type Venue = "oku" | "catch" | "terrace";
type Copy = { headline: string; tag: string; tagline: string; description: string; heroLine1: string; heroLine2: string; heroLine3: string; about: string[] };
type Shift = { label: Record<Locale, string>; start: string; end: string };
type WeeklyDay = { day: number; enabled: boolean; shifts: Shift[] };
type Exception = { date: string; name: Record<Locale, string>; closed: boolean; shifts: Shift[] };
type Content = { hours: Array<{ days: Record<Locale, string>; time: string }>; operationalCalendar: { timezone: "America/Panama"; weekly: WeeklyDay[]; exceptions: Exception[] }; venues: Record<Venue, Record<Locale, Copy>> };

const localeLabels: Record<Locale, string> = { en: "English", es: "Español", pt: "Português" };
const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const blankShift = (): Shift => ({ label: { en: "Service", es: "Servicio", pt: "Serviço" }, start: "17:00", end: "24:00" });

export default function WebsiteContentPage() {
  const [content, setContent] = useState<Content | null>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [venue, setVenue] = useState<Venue>("oku");
  const [message, setMessage] = useState("Loading website content…");
  const [saving, setSaving] = useState(false);

  useEffect(() => { void fetch("/api/v1/admin/website-content").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setContent(body.data); setMessage(""); }).catch((error) => setMessage(error.message)); }, []);

  const updateCopy = (key: keyof Copy, value: string | string[]) => setContent((current) => current ? ({ ...current, venues: { ...current.venues, [venue]: { ...current.venues[venue], [locale]: { ...current.venues[venue][locale], [key]: value } } } }) : current);
  const updateDay = (day: number, mutate: (entry: WeeklyDay) => WeeklyDay) => setContent((current) => current ? ({ ...current, operationalCalendar: { ...current.operationalCalendar, weekly: current.operationalCalendar.weekly.map((entry) => entry.day === day ? mutate(entry) : entry) } }) : current);
  const updateShift = (day: number, index: number, key: "label" | "start" | "end", value: string) => updateDay(day, (entry) => ({ ...entry, shifts: entry.shifts.map((shift, shiftIndex) => shiftIndex !== index ? shift : key === "label" ? { ...shift, label: { ...shift.label, [locale]: value } } : { ...shift, [key]: value }) }));
  const updateException = (index: number, mutate: (entry: Exception) => Exception) => setContent((current) => current ? ({ ...current, operationalCalendar: { ...current.operationalCalendar, exceptions: current.operationalCalendar.exceptions.map((entry, entryIndex) => entryIndex === index ? mutate(entry) : entry) } }) : current);
  const updateExceptionShift = (exceptionIndex: number, shiftIndex: number, mutate: (shift: Shift) => Shift) => updateException(exceptionIndex, (entry) => ({ ...entry, shifts: entry.shifts.map((shift, index) => index === shiftIndex ? mutate(shift) : shift) }));
  const save = async () => {
    if (!content) return;
    setSaving(true); setMessage("Saving…");
    const response = await fetch("/api/v1/admin/website-content", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(content) });
    const body = await response.json(); setSaving(false);
    setMessage(response.ok ? "Website content saved. Public pages update immediately; no code edit is required." : (body.error ?? "Unable to save content"));
  };

  const copy = content?.venues[venue][locale];
  return <div className="dashboard-canvas"><div className="dashboard-body" style={{ maxWidth: 900 }}>
    <div className="dash-eyebrow">PUBLIC WEBSITE</div>
    <h1 className="page-header">Website content</h1>
    <p className="panel-subtitle" style={{ maxWidth: 720 }}>Edit restaurant hours and core venue copy without changing code. English, Spanish, and Portuguese are managed independently. Changes are audited.</p>
    {message && <p role="status" className="panel" style={{ padding: 14, marginTop: 18 }}>{message}</p>}
    {content && copy && <>
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">Operating calendar & reservation hours</div>
        <p className="panel-subtitle">This is the source of truth for public opening hours and every regular reservation surface. Add separate shifts for lunch and dinner. Event ticket times remain controlled by each event session.</p>
        <div className={styles.toolbar} style={{ margin: "16px 0" }}><label><span>Editing language</span><select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{Object.entries(localeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <div className={styles.dayList}>{[1, 2, 3, 4, 5, 6, 0].map((day) => { const entry = content.operationalCalendar.weekly.find((item) => item.day === day)!; return <div key={day} className={styles.dayCard}><div className={styles.dayHeader}><strong>{dayLabels[day]}</strong><label className={styles.toggle}><input type="checkbox" checked={entry.enabled} onChange={(event) => updateDay(day, (current) => ({ ...current, enabled: event.target.checked }))} /> Open</label></div>{entry.enabled && <><div className={styles.shiftList}>{entry.shifts.map((shift, index) => <div key={index} className={styles.shiftRow}><label className={styles.field}><span>Shift label</span><input value={shift.label[locale]} onChange={(event) => updateShift(day, index, "label", event.target.value)} /></label><label className={styles.field}><span>Opens</span><input type="time" value={shift.start} onChange={(event) => updateShift(day, index, "start", event.target.value)} /></label><label className={styles.field}><span>Closes</span><input type="time" value={shift.end === "24:00" ? "00:00" : shift.end} onChange={(event) => updateShift(day, index, "end", event.target.value === "00:00" ? "24:00" : event.target.value)} /></label><button type="button" className="btn btn-secondary" onClick={() => updateDay(day, (current) => ({ ...current, shifts: current.shifts.filter((_, shiftIndex) => shiftIndex !== index) }))}>Remove</button></div>)}</div><button type="button" className="btn btn-secondary" onClick={() => updateDay(day, (current) => ({ ...current, shifts: [...current.shifts, blankShift()] }))}>+ Add shift</button></>}</div>; })}</div>
        <div className={styles.exceptionHeader}><div><div className="panel-title">Holiday & special hours</div><p className="panel-subtitle">A dated exception overrides the normal weekday schedule.</p></div><button type="button" className="btn btn-secondary" onClick={() => setContent((current) => current ? ({ ...current, operationalCalendar: { ...current.operationalCalendar, exceptions: [...current.operationalCalendar.exceptions, { date: "", name: { en: "Special hours", es: "Horario especial", pt: "Horário especial" }, closed: true, shifts: [] }] } }) : current)}>+ Add exception</button></div>
        <div className={styles.dayList}>{content.operationalCalendar.exceptions.map((entry, index) => <div key={`${entry.date}-${index}`} className={styles.dayCard}>
          <div className={styles.exceptionGrid}>
            <label className={styles.field}><span>Date</span><input type="date" value={entry.date} onChange={(event) => updateException(index, (current) => ({ ...current, date: event.target.value }))} /></label>
            <label className={styles.field}><span>Name</span><input value={entry.name[locale]} onChange={(event) => updateException(index, (current) => ({ ...current, name: { ...current.name, [locale]: event.target.value } }))} /></label>
            <label className={styles.toggle}><input type="checkbox" checked={entry.closed} onChange={(event) => updateException(index, (current) => ({ ...current, closed: event.target.checked, shifts: event.target.checked ? [] : (current.shifts.length ? current.shifts : [blankShift()]) }))} /> Closed all day</label>
            <button type="button" className="btn btn-secondary" onClick={() => setContent((current) => current ? ({ ...current, operationalCalendar: { ...current.operationalCalendar, exceptions: current.operationalCalendar.exceptions.filter((_, entryIndex) => entryIndex !== index) } }) : current)}>Delete</button>
          </div>
          {!entry.closed && <div className={styles.shiftList}>{entry.shifts.map((shift, shiftIndex) => <div key={shiftIndex} className={styles.shiftRow}>
            <label className={styles.field}><span>Shift label</span><input value={shift.label[locale]} onChange={(event) => updateExceptionShift(index, shiftIndex, (current) => ({ ...current, label: { ...current.label, [locale]: event.target.value } }))} /></label>
            <label className={styles.field}><span>Opens</span><input type="time" value={shift.start} onChange={(event) => updateExceptionShift(index, shiftIndex, (current) => ({ ...current, start: event.target.value }))} /></label>
            <label className={styles.field}><span>Closes</span><input type="time" value={shift.end === "24:00" ? "00:00" : shift.end} onChange={(event) => updateExceptionShift(index, shiftIndex, (current) => ({ ...current, end: event.target.value === "00:00" ? "24:00" : event.target.value }))} /></label>
          </div>)}</div>}
        </div>)}</div>
      </section>
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">Venue copy</div>
        <div className={styles.toolbar} style={{ margin: "16px 0 22px" }}><label><span>Venue</span><select value={venue} onChange={(event) => setVenue(event.target.value as Venue)}><option value="oku">OKÜ</option><option value="catch">CATCH</option><option value="terrace">TERRACE</option></select></label><label><span>Language</span><select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{Object.entries(localeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <div className={styles.form}><label className={styles.field}><span>Headline</span><input value={copy.headline} onChange={(event) => updateCopy("headline", event.target.value)} /></label><label className={styles.field}><span>Category label</span><input value={copy.tag} onChange={(event) => updateCopy("tag", event.target.value)} /></label><label className={styles.field}><span>Short tagline</span><textarea rows={2} value={copy.tagline} onChange={(event) => updateCopy("tagline", event.target.value)} /></label><label className={styles.field}><span>Restaurant description</span><textarea rows={4} value={copy.description} onChange={(event) => updateCopy("description", event.target.value)} /></label><div className={styles.heroLines}><label className={styles.field}><span>Hero line 1</span><input value={copy.heroLine1} onChange={(event) => updateCopy("heroLine1", event.target.value)} /></label><label className={styles.field}><span>Hero line 2</span><input value={copy.heroLine2} onChange={(event) => updateCopy("heroLine2", event.target.value)} /></label><label className={styles.field}><span>Hero line 3</span><input value={copy.heroLine3} onChange={(event) => updateCopy("heroLine3", event.target.value)} /></label></div><label className={styles.field}><span>About paragraphs (one per line)</span><textarea rows={7} value={copy.about.join("\n")} onChange={(event) => updateCopy("about", event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))} /></label></div>
      </section>
      <div className={styles.actions} style={{ marginTop: 20 }}><button className="btn btn-primary" style={{ minHeight: 48 }} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save website changes"}</button><a className="btn btn-secondary" style={{ minHeight: 48 }} href={`/${locale}/restaurants/${venue}`} target="_blank">Preview venue ↗</a></div>
    </>}
  </div></div>;
}
