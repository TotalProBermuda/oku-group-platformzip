# CATCH Panamá — Standalone Site Starter Kit

A self-contained Next.js site for **CATCH** (catchpanama.com). It reuses the OKÜ
restaurant-profile blueprint (hero → about → gallery → menu → events → reserve),
but stands completely on its own: **no database, no Prisma, no auth, no i18n
plumbing**. All content lives in one editable data file.

All commercial actions — **table reservations** and **event ticket checkout** —
link back to the shared commercial engine at **okuhospitalitygroup.com**. This
site never takes a payment itself.

## How to use this in a brand-new Replit project

1. Create a new Replit project (an empty / "Next.js" or "Node.js" App is fine).
2. Copy **everything inside this `catch-starter-kit/` folder** into the root of
   the new project (so `package.json`, `next.config.mjs`, `src/`, and `public/`
   sit at the top level).
3. Install dependencies: `npm install`
4. Start it: `npm run dev` — it serves on **port 5000**.
5. Deploy, then point **catchpanama.com** at the deployment.

## Where to edit things

| What | File |
| --- | --- |
| Copy, contact, hours, menu, gallery, events | `src/data/catch.ts` |
| Brand colours (dark / crimson / gold) | `src/data/catch.ts` → `brand` |
| Group links (reservations + tickets) | `src/lib/links.ts` |
| Top navigation | `src/components/SiteNav.tsx` |
| Footer | `src/components/SiteFooter.tsx` |
| Page layout / section order | `src/app/page.tsx` |
| Fonts + base styles | `src/app/layout.tsx`, `src/app/globals.css` |
| Images | `public/images/catch/` |

### The links to double-check (verified against the live group app)

`src/lib/links.ts` is the single source of truth:

```ts
export const GROUP_BASE = "https://okuhospitalitygroup.com";
export const LOCALE = "en";
```

| Button | Goes to |
| --- | --- |
| Reserve | `…/en/reservations` |
| Get Tickets (browse) | `…/en/series` |
| Get Tickets (specific event) | `…/en/series/<seriesSlug>` |

The group platform calls events **"Series"** — its public events page is
`/series`, not `/events`. Reservations and series are **not** filtered by a
`?concept` / `?venue` query today, so we link straight to the real pages. If the
group adds venue filtering later, update `reserveUrl` / `eventsUrl` here.

## Events

The Events section is driven by the `events` array in `src/data/catch.ts`. The
three entries are realistic placeholders — replace them with real events. Each
"Get Tickets" button sends the guest to the group engine for checkout (this site
never sells tickets directly).

To deep-link a ticket button to one specific event, set that event's
`seriesSlug` to the **real Series slug** from the group site (e.g. the slug in
`okuhospitalitygroup.com/en/series/<slug>`). Leave `seriesSlug` unset and the
button safely opens the events browse page instead of a dead link.

## Notes

- Copy is in **English** to match the existing OKÜ profile blueprint. CATCH's
  live site is Spanish-first — translate `src/data/catch.ts` (and the few labels
  in the components) when you're ready. There's no locale router here yet; add
  one only if you need EN/ES switching.
- Images were pulled from the current catchpanama.com for development. Swap them
  for final, licensed photography before launch.
- Styling matches the OKÜ blueprint: plain CSS variables + inline styles, fonts
  via `next/font/google` (Inter + Cormorant Garamond). No Tailwind needed.

## Same recipe for the other venues

To launch **OKÜ Asian Fusion** (okupanama.com) or **TERRACE**
(terracepanama.com), duplicate this kit, swap the contents of
`src/data/<venue>.ts`, replace the images and logo, and update the brand colors.
The group URLs in `src/lib/links.ts` (`GROUP_BASE`, `LOCALE`, and the
`/reservations` + `/series` paths) are shared across all venues — leave them as
they are. To deep-link a venue's events to specific group events, set each
event's `seriesSlug` in `src/data/<venue>.ts`.
