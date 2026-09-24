"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

type Locale = "en" | "es" | "pt";
type Venue = "oku" | "catch" | "terrace";
type Copy = { headline: string; tag: string; tagline: string; description: string; heroLine1: string; heroLine2: string; heroLine3: string; about: string[] };
type Content = { hours: Array<{ days: Record<Locale, string>; time: string }>; venues: Record<Venue, Record<Locale, Copy>> };

const localeLabels: Record<Locale, string> = { en: "English", es: "Español", pt: "Português" };

export default function WebsiteContentPage() {
  const [content, setContent] = useState<Content | null>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [venue, setVenue] = useState<Venue>("oku");
  const [message, setMessage] = useState("Loading website content…");
  const [saving, setSaving] = useState(false);

  useEffect(() => { void fetch("/api/v1/admin/website-content").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setContent(body.data); setMessage(""); }).catch((error) => setMessage(error.message)); }, []);

  const updateCopy = (key: keyof Copy, value: string | string[]) => setContent((current) => current ? ({ ...current, venues: { ...current.venues, [venue]: { ...current.venues[venue], [locale]: { ...current.venues[venue][locale], [key]: value } } } }) : current);
  const updateHours = (index: number, key: "days" | "time", value: string) => setContent((current) => {
    if (!current) return current;
    const hours = current.hours.map((row, rowIndex) => rowIndex !== index ? row : key === "time" ? { ...row, time: value } : { ...row, days: { ...row.days, [locale]: value } });
    return { ...current, hours };
  });
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
        <div className="panel-title">Opening hours</div>
        <div className={styles.toolbar} style={{ margin: "16px 0" }}><label><span>Editing language</span><select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{Object.entries(localeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <div className={styles.hours}>{content.hours.map((row, index) => <div key={index} className={styles.form}><label className={styles.field}><span>Days</span><input value={row.days[locale]} onChange={(event) => updateHours(index, "days", event.target.value)} /></label><label className={styles.field}><span>Time</span><input value={row.time} onChange={(event) => updateHours(index, "time", event.target.value)} /></label></div>)}</div>
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
