---
name: Restaurant standalone sites
description: How OKÜ Group's per-restaurant websites relate to the shared commercial engine.
---

# Per-restaurant standalone sites

The OKÜ owner wants each restaurant to be its **own independent website on its own
domain**, NOT sections of the group site and NOT one app serving multiple domains
(multi-domain-on-one-app was explicitly rejected):

- CATCH → catchpanama.com
- OKÜ Asian Fusion → okupanama.com (distinct from the group — do not confuse)
- TERRACE → terracepanama.com
- OKÜ Hospitality Group → okuhospitalitygroup.com is the **shared commercial engine**

**Rule:** restaurant sites are marketing/brand surfaces only. All money/commerce —
table **reservations** and **event-ticket checkout** — must link BACK to the group
engine. A restaurant site never takes a payment itself.
Verified group-engine public routes (do NOT guess — these were wrong before):
- Reservations: `{GROUP}/en/reservations` (page does NOT read a `?concept`/venue param today)
- Events are called **"Series"**: browse at `{GROUP}/en/series`, one event at `{GROUP}/en/series/<seriesSlug>`. There is **no `/events` route** and no `?venue` filter.

Each restaurant site also shows its OWN events list, but "Get Tickets" routes to the
group engine.

**Why:** the group platform owns checkout, payments (Cybersource for Panama), and
referral/commission attribution; duplicating commerce per-site would fragment that.

**How to apply:** when building or editing a venue site, keep the group base URL as a
single source of truth (e.g. one `links.ts` constant) and verify the group's actual
route/query conventions before launch. Reuse the existing restaurant-profile blueprint
(`src/app/[locale]/restaurants/[slug]/page.tsx`) for layout fidelity.

A delivered **CATCH starter kit** (a standalone Next.js 15 app with no Prisma/i18n/auth,
all content static in one data file) was packaged for copying into a brand-new Replit
project. Note: a new separate Replit project cannot be created from inside an existing
one — the user creates it, then an agent there builds. Same kit recipe applies to OKÜ
and TERRACE (swap data + images + logo + brand colors; group URLs in links.ts stay identical).
