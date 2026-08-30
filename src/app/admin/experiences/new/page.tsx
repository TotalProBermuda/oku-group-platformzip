"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
      <section className="admin-page-content" style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px" }}>
        <h1>Create experience</h1>
        <p>
          Choose the operating venue first, then optionally record a physical-space preference. The floor team can
          assign any suitable space within that venue when the reservation is confirmed.
        </p>

        {error ? <p role="alert" className="form-error">{error}</p> : null}

        <form onSubmit={handleSubmit}>
          <fieldset disabled={loading || submitting} style={{ border: 0, margin: 0, padding: 0 }}>
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              required
              value={form.title}
              onChange={(event) => {
                const title = event.target.value;
                setForm((current) => ({ ...current, title, slug: current.slug || toSlug(title) }));
              }}
            />

            <label htmlFor="slug">URL slug *</label>
            <input id="slug" required value={form.slug} onChange={(event) => updateForm("slug", toSlug(event.target.value))} />

            <label htmlFor="description">Description</label>
            <textarea id="description" rows={5} value={form.description} onChange={(event) => updateForm("description", event.target.value)} />

            <label htmlFor="category">Category</label>
            <input id="category" value={form.category} onChange={(event) => updateForm("category", event.target.value)} />

            <label htmlFor="venue">Operating venue *</label>
            <select id="venue" required value={form.venueId} onChange={(event) => selectVenue(event.target.value)}>
              <option value="">Select an operating venue</option>
              {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>

            <label htmlFor="space">Physical-space preference</label>
            <select id="space" value={form.spaceId} onChange={(event) => updateForm("spaceId", event.target.value)}>
              <option value="">No physical-space preference — floor team assigns later</option>
              {availableSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
            <p><small>This does not close the whole venue. Configure a whole-venue closure only in Dining Availability.</small></p>

            <label htmlFor="hostType">Host type *</label>
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

            {form.hostType === "INFLUENCER" ? (
              <>
                <label htmlFor="influencer">Influencer *</label>
                <select id="influencer" required value={form.influencerId} onChange={(event) => updateForm("influencerId", event.target.value)}>
                  <option value="">Select an influencer</option>
                  {influencers.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}
                </select>
              </>
            ) : null}

            {form.hostType === "PARTNER" ? (
              <>
                <label htmlFor="partner">Partner *</label>
                <select id="partner" required value={form.partnerId} onChange={(event) => updateForm("partnerId", event.target.value)}>
                  <option value="">Select a partner</option>
                  {partners.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}
                </select>
              </>
            ) : null}

            <label htmlFor="city">City</label>
            <input id="city" value={form.city} onChange={(event) => updateForm("city", event.target.value)} />
            <label htmlFor="country">Country code</label>
            <input id="country" maxLength={3} value={form.country} onChange={(event) => updateForm("country", event.target.value.toUpperCase())} />
            <label htmlFor="capacity">Total capacity</label>
            <input id="capacity" type="number" min="0" max="100000" value={form.capacityTotal} onChange={(event) => updateForm("capacityTotal", event.target.value)} />
          </fieldset>

          <button type="submit" disabled={loading || submitting || venues.length === 0}>
            {submitting ? "Creating…" : loading ? "Loading…" : "Create experience"}
          </button>
        </form>
      </section>
    </main>
  );
}
