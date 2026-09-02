"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Globe2, MapPin, Sparkles, Users } from "lucide-react";
import styles from "./page.module.css";

type Venue = {
  id: string;
  name: string;
  city?: string | null;
};

type PhysicalSpace = {
  id: string;
  name: string;
  venueId: string;
  isActive?: boolean;
};

type HostEntity = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  handle?: string | null;
};

type FormState = {
  title: string;
  slug: string;
  description: string;
  category: string;
  venueId: string;
  spaceId: string;
  hostType: "OKU" | "CATCH" | "INFLUENCER" | "PARTNER";
  influencerId: string;
  partnerId: string;
  city: string;
  country: string;
  capacityTotal: string;
};

const emptyForm: FormState = {
  title: "",
  slug: "",
  description: "",
  category: "Food & Drink",
  venueId: "",
  spaceId: "",
  hostType: "OKU",
  influencerId: "",
  partnerId: "",
  city: "",
  country: "PA",
  capacityTotal: "",
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const entityLabel = (entity: HostEntity) =>
  entity.displayName || entity.name || entity.handle || entity.id;

export default function NewExperiencePage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [spaces, setSpaces] = useState<PhysicalSpace[]>([]);
  const [influencers, setInfluencers] = useState<HostEntity[]>([]);
  const [partners, setPartners] = useState<HostEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsRequest, setOptionsRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const submissionInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadOptions() {
      setLoading(true);
      setOptionsError(null);
      let lastError: unknown = null;

      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const requestInit: RequestInit = { cache: "no-store", signal: controller.signal };
            const [venueResponse, spaceResponse, hostResponse] = await Promise.all([
              fetch("/api/v1/admin/venues", requestInit),
              fetch("/api/v1/admin/spaces", requestInit),
              fetch("/api/v1/admin/series/host-options", requestInit),
            ]);

            if (!venueResponse.ok || !spaceResponse.ok || !hostResponse.ok) {
              throw new Error("Unable to load the operating venue and physical-space options.");
            }

            const venuePayload = asRecord(await venueResponse.json());
            const spacePayload = asRecord(await spaceResponse.json());
            const hostPayload = asRecord(await hostResponse.json());
            const hostData = asRecord(hostPayload.data);
            const loadedVenues = asArray<Venue>(venuePayload.venues);
            const loadedSpaces = asArray<PhysicalSpace>(spacePayload.data);

            if (loadedVenues.length === 0) {
              throw new Error("No operating venues were returned. Retry the connection before creating an experience.");
            }
            if (cancelled) return;

            lastError = null;
            setVenues(loadedVenues);
            setSpaces(loadedSpaces);
            setInfluencers(asArray<HostEntity>(hostData.influencers));
            setPartners(asArray<HostEntity>(hostData.partners));
            setForm((current) => {
              if (loadedVenues.some((venue) => venue.id === current.venueId)) return current;
              const firstVenue = loadedVenues[0];
              return { ...current, venueId: firstVenue.id, spaceId: "", city: firstVenue.city || current.city };
            });
            return;
          } catch (loadError) {
            if (controller.signal.aborted) return;
            lastError = loadError;
            if (attempt === 0) {
              await new Promise((resolve) => window.setTimeout(resolve, 200));
            }
          }
        }
      } finally {
        if (!cancelled) {
          if (lastError) {
            setVenues([]);
            setOptionsError(lastError instanceof Error ? lastError.message : "Unable to load creation options.");
          }
          setLoading(false);
        }
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [optionsRequest]);

  const availableSpaces = useMemo(
    () =>
      spaces.filter(
        (space) => space.isActive !== false && space.venueId === form.venueId,
      ),
    [form.venueId, spaces],
  );

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectVenue(venueId: string) {
    const venue = venues.find((item) => item.id === venueId);
    setForm((current) => ({
      ...current,
      venueId,
      spaceId: "",
      city: venue?.city || current.city,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "draft" ? "draft" : "continue";
    setError(null);
    setSubmitting(true);
    let unlockSubmission = true;

    try {
      const response = await fetch("/api/v1/admin/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          slug: form.slug,
          description: form.description,
          category: form.category,
          venueId: form.venueId,
          spaceId: form.spaceId || null,
          hostType: form.hostType,
          influencerId: form.hostType === "INFLUENCER" ? form.influencerId : undefined,
          partnerId: form.hostType === "PARTNER" ? form.partnerId : undefined,
          city: form.city,
          country: form.country,
          capacityTotal: form.capacityTotal || undefined,
        }),
      });
      const payload = asRecord(await response.json().catch(() => ({})));

      if (!response.ok) {
        const message = typeof payload.error === "string" ? payload.error : "Unable to create this experience.";
        throw new Error(message);
      }

      const series = asRecord(payload.data);
      if (typeof series.id !== "string") throw new Error("The experience was created without an editor link.");
      const target = `/admin/experiences/${encodeURIComponent(series.id)}?tab=dates`;
      window.location.assign(target);
      unlockSubmission = false;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create this experience.");
    } finally {
      if (unlockSubmission) {
        submissionInFlight.current = false;
        setSubmitting(false);
      }
    }
  }

  const selectedVenue = venues.find((venue) => venue.id === form.venueId);
  const selectedSpace = spaces.find((space) => space.id === form.spaceId);
  const hostLabel = form.hostType === "OKU" ? "OKÜ" : form.hostType === "CATCH" ? "CATCH" : form.hostType === "INFLUENCER"
    ? entityLabel(influencers.find((item) => item.id === form.influencerId) ?? { id: "Influencer pending" })
    : entityLabel(partners.find((item) => item.id === form.partnerId) ?? { id: "Partner pending" });
  const creationDisabled = loading || submitting || venues.length === 0 || Boolean(optionsError);

  return (
    <main className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link href="/admin/experiences">Experiences</Link><span>›</span><span>New experience</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className={styles.heading}>
          <div>
            <h1>Create experience</h1>
            <p>Build the guest-facing details first. Availability, pricing and publishing come next.</p>
          </div>
          <div className={styles.desktopActions}>
            <button className={styles.secondaryButton} type="submit" value="draft" disabled={creationDisabled}>Save draft</button>
            <button className={styles.primaryButton} type="submit" value="continue" disabled={creationDisabled}>
              {submitting ? "Creating…" : "Continue to availability"}
            </button>
          </div>
        </div>

        <div className={styles.stepper} aria-label="Creation progress">
          {[
            ["1", "Experience details"], ["2", "Availability"], ["3", "Pricing"], ["4", "Review & publish"],
          ].map(([number, label], index) => (
            <div className={`${styles.step} ${index === 0 ? styles.activeStep : ""}`} key={number}>
              <span className={styles.stepNumber}>{number}</span><span>{label}</span>
            </div>
          ))}
        </div>

        {optionsError ? (
          <div role="alert" className={styles.optionsError}>
            <div>
              <strong>Operating venues are unavailable.</strong>
              <span>{optionsError}</span>
            </div>
            <button type="button" onClick={() => setOptionsRequest((current) => current + 1)} disabled={loading}>
              {loading ? "Retrying…" : "Retry loading venues"}
            </button>
          </div>
        ) : null}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}

        <div className={styles.layout}>
          <fieldset className={styles.formCard} disabled={loading || submitting}>
            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}><Sparkles aria-hidden="true" /></span>
                <div><h2>Guest-facing details</h2><p>This information appears on the public experience page.</p></div>
              </div>
              <div className={styles.grid}>
                <label className={styles.fullField} htmlFor="title">Experience title <span>*</span>
                  <input id="title" required value={form.title} onChange={(event) => {
                    const title = event.target.value;
                    setForm((current) => ({ ...current, title, slug: current.slug || toSlug(title) }));
                  }} />
                </label>
                <label htmlFor="category">Category
                  <select id="category" value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
                    <option>Food &amp; Drink</option><option>Private Dining</option><option>Entertainment</option><option>Wellness</option><option>Community</option>
                  </select>
                </label>
                <label htmlFor="slug">Page URL <span>*</span>
                  <span className={styles.slugInput}><span>/experiences/</span><input id="slug" required value={form.slug} onChange={(event) => updateForm("slug", toSlug(event.target.value))} /></span>
                </label>
                <label className={styles.fullField} htmlFor="description">Short description
                  <textarea id="description" rows={4} value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
                  <small>Keep this concise; full content and imagery can be added after creation.</small>
                </label>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}><MapPin aria-hidden="true" /></span>
                <div><h2>Venue &amp; space</h2><p>Choose where the experience operates and how the floor team should assign seating.</p></div>
              </div>
              <div className={styles.grid}>
                <label htmlFor="venue">Operating venue <span>*</span>
                  <select id="venue" required value={form.venueId} onChange={(event) => selectVenue(event.target.value)}>
                    <option value="">Select an operating venue</option>
                    {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                  </select>
                </label>
                <label htmlFor="space">Preferred physical space
                  <select id="space" value={form.spaceId} onChange={(event) => updateForm("spaceId", event.target.value)}>
                    <option value="">Floor team assigns the best space</option>
                    {availableSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                  </select>
                  <small>A preference does not block other reservations or close the venue.</small>
                </label>
                <div className={`${styles.fullField} ${styles.sharedChoice}`}>
                  <strong>Shared venue experience</strong><span>Other guests and reservations may use the venue at the same time. Exclusive coverage is scheduled in Availability.</span>
                </div>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}><Building2 aria-hidden="true" /></span>
                <div><h2>Operations</h2><p>Internal ownership and capacity controls.</p></div>
              </div>
              <div className={styles.grid}>
                <label htmlFor="hostType">Host brand <span>*</span>
                  <select id="hostType" value={form.hostType} onChange={(event) => setForm((current) => ({ ...current, hostType: event.target.value as FormState["hostType"], influencerId: "", partnerId: "" }))}>
                    <option value="OKU">OKÜ</option><option value="CATCH">CATCH</option><option value="INFLUENCER">Influencer</option><option value="PARTNER">Partner</option>
                  </select>
                </label>
                {form.hostType === "INFLUENCER" ? <label htmlFor="influencer">Influencer <span>*</span><select id="influencer" required value={form.influencerId} onChange={(event) => updateForm("influencerId", event.target.value)}><option value="">Select an influencer</option>{influencers.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}</select></label> : null}
                {form.hostType === "PARTNER" ? <label htmlFor="partner">Partner <span>*</span><select id="partner" required value={form.partnerId} onChange={(event) => updateForm("partnerId", event.target.value)}><option value="">Select a partner</option>{partners.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}</select></label> : null}
                <label htmlFor="capacity">Maximum capacity
                  <input id="capacity" type="number" min="0" max="100000" value={form.capacityTotal} onChange={(event) => updateForm("capacityTotal", event.target.value)} />
                  <small>Set the programme capacity; each event date can be adjusted next.</small>
                </label>
                <label htmlFor="city">City<input id="city" value={form.city} onChange={(event) => updateForm("city", event.target.value)} /></label>
                <label htmlFor="country">Country code<input id="country" maxLength={3} value={form.country} onChange={(event) => updateForm("country", event.target.value.toUpperCase())} /></label>
              </div>
            </section>
          </fieldset>

          <aside className={styles.aside}>
            <div className={styles.summary}>
              <div className={styles.previewCover}><small>Experience preview</small><strong>{form.title || "Untitled experience"}</strong></div>
              <div className={styles.summaryBody}>
                <p className={styles.summaryLabel}>Setup summary</p>
                <div className={styles.summaryList}>
                  <div><MapPin /><p><strong>{selectedVenue?.name || "Venue pending"}</strong><span>{selectedSpace?.name || "Floor team assigns space"}</span></p></div>
                  <div><Users /><p><strong>{form.capacityTotal || "—"} guests maximum</strong><span>Shared venue experience</span></p></div>
                  <div><Globe2 /><p><strong>{form.city || "Location pending"}</strong><span>{form.slug ? `/experiences/${form.slug}` : "Public URL pending"}</span></p></div>
                  <div><Building2 /><p><strong>{hostLabel}</strong><span>Host brand</span></p></div>
                </div>
                <div className={styles.status}><span>Status</span><span>Draft</span></div>
              </div>
            </div>
            <div className={styles.nextNote}><strong>What happens next?</strong><br />Availability defines dates, recurrence, and dining coverage. Pricing can vary by ticket type and add-on.</div>
          </aside>
        </div>

        <div className={styles.mobileActions}>
          <Link className={styles.secondaryButton} href="/admin/experiences">Cancel</Link>
          <button className={styles.primaryButton} type="submit" value="continue" disabled={creationDisabled}>{submitting ? "Creating…" : "Continue"}</button>
        </div>
      </form>
    </main>
  );
}
