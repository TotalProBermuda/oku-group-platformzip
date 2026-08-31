"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [spaces, setSpaces] = useState<PhysicalSpace[]>([]);
  const [influencers, setInfluencers] = useState<HostEntity[]>([]);
  const [partners, setPartners] = useState<HostEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const [venueResponse, spaceResponse, hostResponse] = await Promise.all([
          fetch("/api/v1/admin/venues"),
          fetch("/api/v1/admin/spaces"),
          fetch("/api/v1/admin/series/host-options"),
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

        if (cancelled) return;

        setVenues(loadedVenues);
        setSpaces(loadedSpaces);
        setInfluencers(asArray<HostEntity>(hostData.influencers));
        setPartners(asArray<HostEntity>(hostData.partners));
        setForm((current) => {
          if (current.venueId || loadedVenues.length === 0) return current;
          const firstVenue = loadedVenues[0];
          return { ...current, venueId: firstVenue.id, city: firstVenue.city || current.city };
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load creation options.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setError(null);
    setSubmitting(true);

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
      router.push(`/admin/experiences/${series.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create this experience.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-shell-container">
      <section className="admin-page-content experience-create">
        <Link className="back-link" href="/admin/experiences">← Experiences</Link>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Restaurant operations</p>
            <h1>Create experience</h1>
            <p>Set the operating venue, then optionally capture a physical-space preference for the floor team.</p>
          </div>
        </div>

        {error ? <p role="alert" className="form-error">{error}</p> : null}

        <form className="experience-form" onSubmit={handleSubmit}>
          <fieldset disabled={loading || submitting}>
            <section className="form-panel">
              <div className="panel-heading">
                <h2>Experience details</h2>
                <p>These details appear in the editor after creation.</p>
              </div>

              <div className="form-grid">
                <label htmlFor="title">Title <span>*</span>
                  <input
                    id="title"
                    required
                    value={form.title}
                    onChange={(event) => {
                      const title = event.target.value;
                      setForm((current) => ({ ...current, title, slug: current.slug || toSlug(title) }));
                    }}
                  />
                </label>

                <label htmlFor="slug">URL slug <span>*</span>
                  <input id="slug" required value={form.slug} onChange={(event) => updateForm("slug", toSlug(event.target.value))} />
                </label>

                <label className="field-full" htmlFor="description">Description
                  <textarea id="description" rows={5} value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
                </label>

                <label htmlFor="category">Category
                  <input id="category" value={form.category} onChange={(event) => updateForm("category", event.target.value)} />
                </label>
              </div>
            </section>

            <section className="form-panel location-panel">
              <div className="panel-heading">
                <h2>Venue and space</h2>
                <p>Choose where the experience operates. A space is a preference, not a strict guest seating assignment.</p>
              </div>

              <div className="form-grid">
                <label htmlFor="venue">Operating venue <span>*</span>
                  <select id="venue" required value={form.venueId} onChange={(event) => selectVenue(event.target.value)}>
                    <option value="">Select an operating venue</option>
                    {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                  </select>
                </label>

                <label htmlFor="space">Physical-space preference
                  <select id="space" value={form.spaceId} onChange={(event) => updateForm("spaceId", event.target.value)}>
                    <option value="">No physical-space preference — floor team assigns later</option>
                    {availableSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                  </select>
                </label>
              </div>
              <p className="field-helper">This does not close the whole venue. Configure a whole-venue closure only in Dining Availability.</p>
            </section>

            <section className="form-panel">
              <div className="panel-heading">
                <h2>Hosting and capacity</h2>
                <p>Assign a verified partner or influencer when their host type is selected.</p>
              </div>

              <div className="form-grid">
                <label htmlFor="hostType">Host type <span>*</span>
                  <select
                    id="hostType"
                    value={form.hostType}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      hostType: event.target.value as FormState["hostType"],
                      influencerId: "",
                      partnerId: "",
                    }))}
                  >
                    <option value="OKU">OKÜ</option>
                    <option value="CATCH">CATCH</option>
                    <option value="INFLUENCER">Influencer</option>
                    <option value="PARTNER">Partner</option>
                  </select>
                </label>

                {form.hostType === "INFLUENCER" ? (
                  <label htmlFor="influencer">Influencer <span>*</span>
                    <select id="influencer" required value={form.influencerId} onChange={(event) => updateForm("influencerId", event.target.value)}>
                      <option value="">Select an influencer</option>
                      {influencers.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}
                    </select>
                  </label>
                ) : null}

                {form.hostType === "PARTNER" ? (
                  <label htmlFor="partner">Partner <span>*</span>
                    <select id="partner" required value={form.partnerId} onChange={(event) => updateForm("partnerId", event.target.value)}>
                      <option value="">Select a partner</option>
                      {partners.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}
                    </select>
                  </label>
                ) : null}

                <label htmlFor="city">City
                  <input id="city" value={form.city} onChange={(event) => updateForm("city", event.target.value)} />
                </label>
                <label htmlFor="country">Country code
                  <input id="country" maxLength={3} value={form.country} onChange={(event) => updateForm("country", event.target.value.toUpperCase())} />
                </label>
                <label htmlFor="capacity">Total capacity
                  <input id="capacity" type="number" min="0" max="100000" value={form.capacityTotal} onChange={(event) => updateForm("capacityTotal", event.target.value)} />
                </label>
              </div>
            </section>
          </fieldset>

          <div className="form-actions">
            <Link className="button button-secondary" href="/admin/experiences">Cancel</Link>
            <button className="button button-primary" type="submit" disabled={loading || submitting || venues.length === 0}>
              {submitting ? "Creating…" : loading ? "Loading…" : "Create experience"}
            </button>
          </div>
        </form>
      </section>
      <style jsx>{`
        .experience-create { max-width: 1120px; margin: 0 auto; padding: 40px 24px 72px; }
        .back-link { color: #8a827c; display: inline-block; font-size: 14px; margin-bottom: 20px; text-decoration: none; }
        .back-link:hover { color: #c81f40; text-decoration: underline; }
        .page-heading { align-items: end; display: flex; justify-content: space-between; margin-bottom: 28px; }
        .eyebrow { color: #a79c93; font-size: 12px; font-weight: 800; letter-spacing: .11em; margin: 0 0 6px; text-transform: uppercase; }
        h1 { color: #231f20; font-family: Georgia, serif; font-size: clamp(32px, 4vw, 44px); font-weight: 400; margin: 0; }
        .page-heading > div > p:last-child { color: #766e69; font-size: 17px; line-height: 1.5; margin: 8px 0 0; max-width: 710px; }
        .experience-form fieldset { border: 0; margin: 0; padding: 0; }
        .form-panel { background: #fff; border: 1px solid #e5dfda; border-radius: 20px; box-shadow: 0 8px 22px rgba(58, 37, 25, .06); margin-bottom: 20px; padding: 28px; }
        .location-panel { border-left: 4px solid #c91f40; }
        .panel-heading { border-bottom: 1px solid #eee8e4; margin-bottom: 22px; padding-bottom: 17px; }
        h2 { color: #2b2523; font-size: 18px; font-weight: 750; margin: 0; }
        .panel-heading p { color: #8a817a; font-size: 14px; line-height: 1.5; margin: 5px 0 0; }
        .form-grid { display: grid; gap: 20px 22px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        label { color: #756c66; display: grid; font-size: 12px; font-weight: 800; gap: 8px; letter-spacing: .07em; text-transform: uppercase; }
        label span { color: #c91f40; }
        .field-full { grid-column: 1 / -1; }
        input, select, textarea { background: #fff; border: 1px solid #dcd5d0; border-radius: 9px; box-sizing: border-box; color: #2d2928; font: inherit; font-size: 16px; font-weight: 400; letter-spacing: normal; min-height: 48px; padding: 11px 13px; text-transform: none; width: 100%; }
        textarea { line-height: 1.5; min-height: 130px; resize: vertical; }
        input:focus, select:focus, textarea:focus { border-color: #c91f40; box-shadow: 0 0 0 3px rgba(201, 31, 64, .12); outline: none; }
        .field-helper { color: #847a73; font-size: 13px; line-height: 1.45; margin: 14px 0 0; }
        .form-error { background: #fff0f1; border: 1px solid #f2bcc4; border-radius: 10px; color: #a3112b; margin: 0 0 20px; padding: 13px 16px; }
        .form-actions { align-items: center; display: flex; gap: 12px; justify-content: flex-end; margin-top: 26px; }
        .button { border-radius: 9px; display: inline-flex; font-size: 14px; font-weight: 800; justify-content: center; letter-spacing: .06em; min-width: 132px; padding: 14px 18px; text-decoration: none; text-transform: uppercase; }
        .button-primary { background: #c91f40; border: 1px solid #c91f40; color: #fff; cursor: pointer; }
        .button-primary:hover:not(:disabled) { background: #a71733; border-color: #a71733; }
        .button-primary:disabled { cursor: not-allowed; opacity: .6; }
        .button-secondary { background: #fff; border: 1px solid #dcd5d0; color: #4f4844; }
        .button-secondary:hover { border-color: #b7ada7; }
        @media (max-width: 700px) { .experience-create { padding: 28px 16px 48px; } .form-panel { border-radius: 14px; padding: 20px; } .form-grid { grid-template-columns: 1fr; } .field-full { grid-column: auto; } .form-actions { align-items: stretch; flex-direction: column-reverse; } .button { width: 100%; } }
      `}</style>
    </main>
  );
}
