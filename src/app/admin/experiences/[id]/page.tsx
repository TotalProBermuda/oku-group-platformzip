"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import InvitationPanel from "@/components/invitation/InvitationPanel";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import ExperienceAnalyticsTab from "@/components/admin/ExperienceAnalyticsTab";
import TicketTypeManager from "@/components/admin/TicketTypeManager";
import SeriesHostManager from "@/components/admin/SeriesHostManager";
import OperatorsPanel from "@/components/admin/OperatorsPanel";
import SeriesSponsorManager from "@/components/admin/SeriesSponsorManager";
import SeriesInfluencerManager from "@/components/admin/SeriesInfluencerManager";
import ReservationBlocksPanel from "@/components/admin/ReservationBlocksPanel";
import SeriesMenusPanel from "@/components/admin/SeriesMenusPanel";
import EventOccupancyPanel from "@/components/admin/EventOccupancyPanel";
import MediaUpload from "@/components/ui/MediaUpload";

const SECTION_TABS = [
  { id: "basics",            label: "Basic Info" },
  { id: "dates",             label: "Dates & Capacity" },
  { id: "access",            label: "Access Rules" },
  { id: "countdown",         label: "Countdown" },
  { id: "seo",               label: "SEO" },
  { id: "status",            label: "Status & Publish" },
  { id: "invitations",       label: "Invitations" },
  { id: "tickets",           label: "Ticket Types" },
  { id: "addons",            label: "Add-Ons" },
  { id: "hosts",             label: "Hosts" },
  { id: "sponsors",          label: "Sponsors" },
  { id: "influencers",       label: "Influencers" },
  { id: "operators",         label: "Operators" },
  { id: "attendees",         label: "Attendees" },
  { id: "reservationBlocks", label: "Reservation Blocks" },
  { id: "diningAvailability", label: "Dining Availability" },
  { id: "menus",             label: "Menus" },
  { id: "analytics",         label: "Analytics" },
];

export default function AdminExperienceEditPage() {
  const { id } = useParams() as { id: string };
  const router  = useRouter();
  const t = useTranslation();
  const [series, setSeries]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [tab,     setTab]     = useState("basics");
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");
  const [form,    setForm]    = useState<any>({});
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [venues, setVenues] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [hostOptions, setHostOptions] = useState<{ influencers: any[]; partners: any[] }>({ influencers: [], partners: [] });

  const loadSeries = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/experiences/${id}`);
    const data = await res.json();
    setSeries(data.series);
    setForm(data.series ?? {});
    setLoading(false);
  }, [id]);

  useEffect(() => { loadSeries(); }, [loadSeries]);
  useEffect(() => {
    Promise.all([
      fetch("/api/v1/admin/venues").then((r) => r.json()),
      fetch("/api/v1/admin/spaces").then((r) => r.json()),
      fetch("/api/v1/admin/series/host-options").then((r) => r.json()),
    ])
      .then(([venueResponse, spaceResponse, hostResponse]) => {
        setVenues(venueResponse.venues ?? []);
        setSpaces(spaceResponse.data ?? []);
        setHostOptions(hostResponse.data ?? { influencers: [], partners: [] });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        const roles: string[] = data?.user?.roles ?? [];
        setUserRoles(roles);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (series?.title) setDuplicateTitle(`${series.title} (Copy)`);
  }, [series?.title]);

  async function save() {
    setSaving(true); setError(""); setSuccess("");
    const res = await fetch(`/api/v1/admin/experiences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      const issues = Array.isArray(data.issues) ? data.issues.map((issue: { message?: string }) => issue.message).filter(Boolean).join(" ") : "";
      setError(issues || data.error || t("admin", "save_failed") || "Save failed");
    }
    else         { setSuccess(t("admin", "saved") ?? "Saved successfully"); setSeries(data.series); setForm(data.series); }
    setSaving(false);
  }

  async function handleDuplicate() {
    setDuplicating(true);
    const res = await fetch(`/api/v1/admin/experiences/${id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: duplicateTitle }),
    });
    const data = await res.json();
    setDuplicating(false);
    if (res.ok && data.series?.id) {
      setShowDuplicateModal(false);
      router.push(`/admin/experiences/${data.series.id}`);
    } else {
      setError(data.error ?? "Duplicate failed");
    }
  }

  async function handleArchive() {
    const isArchived = form.status === "ARCHIVED";
    const msg = isArchived
      ? "Restore this experience to DRAFT?"
      : "Archive this experience? It will be hidden from the public listing.";
    if (!confirm(msg)) return;
    setSaving(true);
    const res = await fetch(`/api/v1/admin/experiences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: isArchived ? "DRAFT" : "ARCHIVED" }),
    });
    const data = await res.json();
    if (res.ok) {
      setSeries(data.series);
      setForm(data.series);
      setSuccess(isArchived ? "Experience restored to DRAFT." : "Experience archived.");
    } else {
      setError(data.error ?? "Failed to update status");
    }
    setSaving(false);
  }

  function field(key: string, label: string, type = "text", opts?: { rows?: number; options?: string[] }) {
    const val = form[key] ?? "";
    if (opts?.options) {
      return (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
          <select value={val} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
            {opts.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (type === "textarea") {
      return (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
          <textarea rows={opts?.rows ?? 4} value={val} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
        </div>
      );
    }
    if (type === "checkbox") {
      return (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={!!form[key]} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.checked }))} style={{ width: 16, height: 16 }} />
          <label style={{ fontSize: 14, color: "#374151" }}>{label}</label>
        </div>
      );
    }
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
        <input type={type} value={val} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14 }} />
      </div>
    );
  }

  if (loading) return <div className="page-container" style={{ padding: "80px 24px", textAlign: "center" }}><div className="loading-spinner" style={{ margin: "0 auto" }} /></div>;
  if (!series) return <div className="page-container" style={{ padding: "80px 24px" }}>{t("admin", "not_found") ?? "Experience not found."} <Link href="/admin/experiences" style={{ color: "#c41e3a" }}>← {t("navigation", "back") ?? "Back"}</Link></div>;

  const isSuperAdmin = userRoles.includes("SUPERADMIN");
  const analyticsTab = tab === "analytics" || tab === "invitations";
  const selfManagedTab = ["analytics", "tickets", "attendees", "influencers", "invitations", "hosts", "sponsors", "reservationBlocks", "operators"].includes(tab);

  return (
    <div>
      {showDuplicateModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "white", borderRadius: 16, padding: 32, maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 8 }}>Duplicate Experience</h3>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>A copy will be created with DRAFT status. Sessions will be shifted to preserve the original scheduling interval.</p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>New Title</label>
              <input
                value={duplicateTitle}
                onChange={(e) => setDuplicateTitle(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowDuplicateModal(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={handleDuplicate} disabled={duplicating || !duplicateTitle.trim()} className="btn btn-primary" style={{ fontSize: 13 }}>
                {duplicating ? "Duplicating…" : "Duplicate"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#fafaf9", borderBottom: "1px solid #e5e0d8", padding: "24px 0" }}>
        <div className="page-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Link href="/admin/experiences" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>← {t("admin", "experiences") ?? "Experiences"}</Link>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 400, color: "#1a1614", margin: "6px 0 0" }}>{series.title}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/experiences/${series.slug}`} target="_blank" className="btn btn-ghost" style={{ fontSize: 13 }}>{t("admin", "view_live") ?? "View Live"} ↗</Link>
            <Link href={`/admin/experiences/${id}/attendees`} className="btn btn-ghost" style={{ fontSize: 13 }}>{t("admin", "attendees") ?? "Attendees"}</Link>
            {isSuperAdmin && (
              <button onClick={() => setShowDuplicateModal(true)} className="btn btn-ghost" style={{ fontSize: 13 }}>Duplicate</button>
            )}
            <button
              onClick={handleArchive}
              disabled={saving}
              className="btn btn-ghost"
              style={{ fontSize: 13, color: form.status === "ARCHIVED" ? "#6b7280" : "#9ca3af" }}
            >
              {form.status === "ARCHIVED" ? "Restore" : "Archive"}
            </button>
            {!selfManagedTab && <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? (t("admin", "saving") ?? "Saving…") : (t("admin", "save_changes") ?? "Save Changes")}</button>}
          </div>
        </div>
      </div>

      {success && <div style={{ background: "#dcfce7", borderBottom: "1px solid #bbf7d0", padding: "12px 24px", fontSize: 14, color: "#16a34a", fontWeight: 500 }}>{success}</div>}
      {error   && <div style={{ background: "#fee2e2", borderBottom: "1px solid #fecaca", padding: "12px 24px", fontSize: 14, color: "#dc2626", fontWeight: 500 }}>{error}</div>}

      <div style={{ display: "flex" }}>
        <div style={{ width: 200, borderRight: "1px solid #e5e0d8", minHeight: "calc(100vh - 120px)", background: "#fafaf9", padding: "20px 0", flexShrink: 0 }}>
          {SECTION_TABS.map((s) => (
            <button key={s.id} onClick={() => setTab(s.id)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 20px", background: tab === s.id ? "white" : "transparent", color: tab === s.id ? "#c41e3a" : "#6b7280", fontSize: 14, fontWeight: tab === s.id ? 600 : 400, cursor: "pointer", border: "none", borderLeft: tab === s.id ? "2px solid #c41e3a" : "2px solid transparent" }}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: analyticsTab ? "0" : "32px", maxWidth: analyticsTab ? "none" : 720 }}>
          {tab === "basics" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 24, color: "#1a1614" }}>{t("admin", "basic_info") ?? "Basic Information"}</h2>
              {field("title", t("admin", "title") ?? "Title")}
              {field("subtitle", t("admin", "subtitle") ?? "Subtitle")}
              {field("slug", t("admin", "url_slug") ?? "URL Slug")}
              {field("description", t("admin", "description") ?? "Description", "textarea", { rows: 6 })}
              {field("category", t("admin", "category") ?? "Category", "text", { options: ["Food & Drink", "Wellness", "Design & Art", "Music", "Business", "Community"] })}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Host type</label>
                <select value={form.hostType ?? "OKU"} onChange={(e) => setForm((p: any) => ({ ...p, hostType: e.target.value, influencerId: null, partnerId: null }))} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
                  <option value="OKU">OKÜ</option><option value="CATCH">CATCH</option><option value="INFLUENCER">Influencer</option><option value="PARTNER">Partner</option>
                </select>
              </div>
              {form.hostType === "INFLUENCER" && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Influencer host</label>
                  <select value={form.influencerId ?? ""} onChange={(e) => setForm((p: any) => ({ ...p, influencerId: e.target.value || null }))} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
                    <option value="">Select an influencer</option>
                    {hostOptions.influencers.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName || profile.user?.name || profile.handle || profile.user?.email}{profile.approved ? "" : " (not approved)"}</option>)}
                  </select>
                </div>
              )}
              {form.hostType === "PARTNER" && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Partner host</label>
                  <select value={form.partnerId ?? ""} onChange={(e) => setForm((p: any) => ({ ...p, partnerId: e.target.value || null }))} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
                    <option value="">Select a partner</option>
                    {hostOptions.partners.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || profile.user?.name || profile.user?.email}{profile.approved ? "" : " (not approved)"}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Operational venue</label>
                <select value={form.venueId ?? ""} onChange={(e) => setForm((p: any) => ({ ...p, venueId: e.target.value, spaceId: "" }))} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
                  <option value="">Select a venue</option>
                  {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Physical space (optional)</label>
                <select value={form.spaceId ?? ""} onChange={(e) => setForm((p: any) => ({ ...p, spaceId: e.target.value || null }))} disabled={!form.venueId} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
                  <option value="">Entire venue — no physical space assigned</option>
                  {spaces.filter((space) => space.venueId === form.venueId && space.isActive).map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                </select>
              </div>
              {field("city", t("admin", "city") ?? "City")}
              {field("country", t("admin", "country") ?? "Country")}
              {field("venueAddress", t("admin", "venue_address") ?? "Venue Address")}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("admin", "hero_image") ?? "Hero Image"}</label>
                <MediaUpload
                  value={form.heroImageUrl ?? ""}
                  onChange={(url) => setForm((p: any) => ({ ...p, heroImageUrl: url }))}
                  mediaType="image"
                  aspectRatio="wide"
                  maxSizeMB={10}
                />
              </div>
              {field("communityUrl", t("admin", "community_url") ?? "Community/Discord URL")}
            </div>
          )}

          {tab === "dates" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 24, color: "#1a1614" }}>{t("admin", "dates_capacity") ?? "Dates & Capacity"}</h2>
              {field("startsAt", t("admin", "series_starts") ?? "Series Starts", "datetime-local")}
              {field("endsAt", t("admin", "series_ends") ?? "Series Ends", "datetime-local")}
              <div style={{ borderTop: "1px solid #e5e0d8", margin: "24px 0" }} />
              {field("capacityTotal", t("admin", "total_capacity") ?? "Total Capacity", "number")}
              {field("availableSeatsMode", t("admin", "seats_display") ?? "Available Seats Display", "text", { options: ["HIDDEN", "EXACT", "APPROXIMATE"] })}
              {field("attendeeListMode", t("admin", "attendee_list_mode") ?? "Attendee List Mode", "text", { options: ["HIDDEN", "BUYERS_ONLY", "PARTIAL", "PUBLIC"] })}
            </div>
          )}

          {tab === "access" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 24, color: "#1a1614" }}>{t("admin", "access_rules") ?? "Access Rules"}</h2>
              {field("membershipRuleMode", t("admin", "membership_rule") ?? "Membership Rule", "text", { options: ["NONE", "MEMBERS_EARLY_ACCESS", "MEMBERS_DISCOUNT", "MEMBERS_ONLY"] })}
              {field("waitlistEnabled", t("admin", "waitlist_enabled") ?? "Waitlist Enabled", "checkbox")}
              {field("newsletterCaptureEnabled", t("admin", "newsletter_capture") ?? "Newsletter Capture Enabled", "checkbox")}
              {field("isFeatured", t("admin", "featured_homepage") ?? "Featured on homepage", "checkbox")}
            </div>
          )}

          {tab === "countdown" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 24, color: "#1a1614" }}>{t("admin", "countdown_release") ?? "Countdown Release"}</h2>
              {field("showCountdown", t("admin", "show_countdown") ?? "Show Countdown", "checkbox")}
              {field("countdownLabel", t("admin", "countdown_label") ?? "Countdown Label")}
              {field("earlyReleaseAt", t("admin", "early_access_release") ?? "Early Access Release (members)", "datetime-local")}
              {field("publicReleaseAt", t("admin", "public_release") ?? "Public Release", "datetime-local")}
            </div>
          )}

          {tab === "seo" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 24, color: "#1a1614" }}>{t("admin", "seo") ?? "SEO"}</h2>
              {field("seoTitle", t("admin", "seo_title") ?? "SEO Title")}
              {field("seoDescription", t("admin", "seo_description") ?? "SEO Description", "textarea", { rows: 3 })}
            </div>
          )}

          {tab === "status" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 24, color: "#1a1614" }}>{t("admin", "status_publish") ?? "Status & Publish"}</h2>
              {field("status", t("admin", "status") ?? "Status", "text", { options: ["DRAFT", "PUBLISHED", "SOLD_OUT", "CANCELLED", "ARCHIVED"] })}
              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <button
                  onClick={handleArchive}
                  disabled={saving}
                  style={{ padding: "8px 16px", border: "1px solid #e5e0d8", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 13, fontWeight: 500, color: form.status === "ARCHIVED" ? "#6b7280" : "#9ca3af" }}
                >
                  {form.status === "ARCHIVED" ? "Restore to Draft" : "Archive This Experience"}
                </button>
              </div>
              <div style={{ marginTop: 24, padding: "20px", background: "#fff9f9", border: "1px solid #fecaca", borderRadius: 12 }}>
                <div style={{ fontWeight: 600, color: "#dc2626", marginBottom: 8 }}>{t("admin", "publish_checklist") ?? "Publish Checklist"}</div>
                {[
                  { ok: !!form.title,         label: t("admin", "check_title") ?? "Title set" },
                  { ok: !!form.venueId,       label: "Operational venue selected" },
                  { ok: (series.sessions?.length ?? 0) > 0, label: "At least 1 event session" },
                  { ok: (series.ticketTypes?.length ?? 0) > 0, label: t("admin", "check_ticket_type") ?? "At least 1 ticket type" },
                  { ok: form.hostType !== "INFLUENCER" || !!form.influencerId, label: "Influencer host selected when required" },
                  { ok: form.hostType !== "PARTNER" || !!form.partnerId, label: "Partner host selected when required" },
                ].map((c) => (
                  <div key={c.label} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ color: c.ok ? "#16a34a" : "#9ca3af", fontSize: 16 }}>{c.ok ? "✓" : "○"}</span>
                    <span style={{ fontSize: 14, color: c.ok ? "#1a1614" : "#9ca3af" }}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "invitations" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 8, color: "#1a1614" }}>{t("admin", "invitations") ?? "Invitations"}</h2>
              <p style={{ color: "#7c7168", fontSize: 14, marginBottom: 24 }}>{t("admin", "invitations_desc") ?? "Send segmented invitations to your audience."}</p>
              <InvitationPanel seriesId={id} />
            </div>
          )}

          {(tab === "tickets" || tab === "addons" || tab === "influencers" || tab === "attendees") && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 12, color: "#1a1614" }}>
                {tab === "tickets" ? (t("admin", "ticket_types") ?? "Ticket Types") : tab === "addons" ? (t("admin", "addons") ?? "Add-Ons") : tab === "influencers" ? (t("admin", "influencer_assignments") ?? "Influencer Assignments") : (t("admin", "attendees") ?? "Attendees")}
              </h2>
              {tab === "tickets" && (
                <TicketTypeManager seriesId={id} />
              )}
              {tab === "addons" && (
                <>
                  {series.addons?.map((a: any) => (
                    <div key={a.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 10, padding: "16px", marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, color: "#1a1614" }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>${(a.priceCents / 100).toFixed(0)} · Cap: {a.capacity ?? "∞"}</div>
                      {a.description && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{a.description}</div>}
                    </div>
                  ))}
                </>
              )}
              {tab === "influencers" && (
                <SeriesInfluencerManager seriesId={id} />
              )}
              {tab === "attendees" && (
                <div>
                  <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>{t("admin", "attendees_desc") ?? "View and manage attendees for this experience."}</p>
                  <Link href={`/admin/experiences/${id}/attendees`} className="btn btn-primary">{t("admin", "go_to_attendees") ?? "Go to Attendees & Check-in"} →</Link>
                </div>
              )}
            </div>
          )}

          {tab === "hosts" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 8, color: "#1a1614" }}>
                {t("admin", "host_management") ?? "Host Management"}
              </h2>
              <p style={{ color: "#7c7168", fontSize: 14, marginBottom: 24 }}>
                {t("admin", "host_management_desc") ?? "Assign persons or companies as hosts for this series. Sessions inherit these hosts by default, but can override with their own host list."}
              </p>
              <SeriesHostManager seriesId={id} />
            </div>
          )}

          {tab === "sponsors" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 8, color: "#1a1614" }}>
                {t("admin", "sponsors") ?? "Sponsors"}
              </h2>
              <p style={{ color: "#7c7168", fontSize: 14, marginBottom: 24 }}>
                {t("admin", "sponsors_desc") ?? "Assign sponsor brands to this series. Sponsors are inherited by events within the series and can be overridden at the event level."}
              </p>
              <SeriesSponsorManager seriesId={id} />
            </div>
          )}

          {tab === "reservationBlocks" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 8, color: "#1a1614" }}>
                Reservation Blocks
              </h2>
              <p style={{ color: "#7c7168", fontSize: 14, marginBottom: 24 }}>
                Create named group reservations with QR codes for streetside check-in. Each block has an expected headcount and tracks arrivals in real time.
              </p>
              <ReservationBlocksPanel
                seriesId={id}
                sessions={series.sessions ?? []}
              />
            </div>
          )}

          {tab === "diningAvailability" && (
            <EventOccupancyPanel
              seriesId={id}
              venueId={series?.venueId}
              seriesSpaceId={series?.spaceId}
              spaces={spaces}
              isPublished={series?.status === "PUBLISHED"}
            />
          )}

          {tab === "operators" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 8, color: "#1a1614" }}>
                Operators
              </h2>
              <p style={{ color: "#7c7168", fontSize: 14, marginBottom: 24 }}>
                Anyone earning attribution against this series — streetside hosts, taxi drivers, tour guides, hotel concierges, sub-referrers. Read-only roster of the new ReferralActor primitive scoped to this series.
              </p>
              <OperatorsPanel
                container={{ kind: "scope", scopeType: "SERIES", scopeId: id }}
                allowAddOperator
                contextNames={{ scopeName: series?.title ?? series?.name ?? null }}
              />

              {/* Per-session collapsibles. Until an EVENT scope exists,
                  sessions inherit the SERIES roster. */}
              {(() => {
                type SessionRow = { id: string; startsAt?: string | Date | null };
                const sessions: SessionRow[] = Array.isArray(series.sessions) ? series.sessions : [];
                if (sessions.length === 0) return null;
                return (
                <div style={{ marginTop: 32 }}>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, marginBottom: 8, color: "#1a1614" }}>
                    Per-session roster
                  </h3>
                  <p style={{ color: "#9b8f85", fontSize: 12, marginBottom: 14 }}>
                    Operators eligible per session. Until per-session scope lands, sessions inherit the series-level roster shown above.
                  </p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {sessions.map((s) => {
                      const when = s.startsAt ? new Date(s.startsAt).toLocaleString() : "—";
                      return (
                        <details key={s.id} style={{ background: "#fff", border: "1px solid #ece6df", borderRadius: 10, padding: "10px 14px" }}>
                          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1a1614", display: "flex", justifyContent: "space-between" }}>
                            <span>{when}</span>
                            <span style={{ color: "#9b8f85", fontWeight: 400 }}>session · {s.id.slice(0, 8)}…</span>
                          </summary>
                          <div style={{ marginTop: 12 }}>
                            <OperatorsPanel
                              container={{ kind: "scope", scopeType: "SERIES", scopeId: id }}
                              compact
                              allowAddOperator
                              contextNames={{ scopeName: `${series?.title ?? series?.name ?? "session"} · ${when}` }}
                            />
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
                );
              })()}
            </div>
          )}

          {tab === "menus" && (
            <SeriesMenusPanel seriesId={id} seriesTitle={String(form?.title ?? series?.title ?? "this event")} />
          )}

          {tab === "analytics" && (
            <ExperienceAnalyticsTab seriesId={id} />
          )}

          {!selfManagedTab && (
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #e5e0d8" }}>
              <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? (t("admin", "saving") ?? "Saving…") : (t("admin", "save_changes") ?? "Save Changes")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
