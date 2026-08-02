# Master prompt for the new CATCH Replit project

Create a brand-new Replit project, upload + extract the `catch-starter-kit` files
into it (so `package.json`, `next.config.mjs`, `src/`, `public/` sit at the
**root**), then paste the prompt below to the Agent.

---

## ⬇️ Copy everything between the lines into the new project's Agent

---

You are setting up a **standalone marketing website for CATCH** (catchpanama.com),
one restaurant in the OKÜ Hospitality Group. The full site already exists in this
project as a starter kit — your job is to get it running, verify every link, and
prepare it for launch. **Do not redesign it and do not rebuild from scratch.**

**1. Project structure.** The starter kit files should be at the project root:
`package.json`, `next.config.mjs`, `tsconfig.json`, `src/`, `public/images/catch/`.
If they are nested inside a `catch-starter-kit/` folder, move them up to the root.
This is a Next.js 15 (App Router) app — plain CSS variables + inline styles, fonts
via `next/font/google`. There is intentionally **no database, Prisma, auth, or
i18n**. Keep it that way.

**2. Run it.** Install dependencies (`npm install`). Configure the workflow to run
`npm run dev` which serves on **port 5000**. For the Replit preview/proxy, make
sure the dev server binds all hosts — run `next dev -p 5000 -H 0.0.0.0`, and if
Next logs a cross-origin dev warning, add `allowedDevOrigins: ['*']` to
`next.config.mjs`. Confirm the homepage renders: hero, About, Gallery, Menu,
Events, Reserve, footer.

**3. The links — DO NOT CHANGE THE TARGETS.** All reservations and ticket sales
happen on the shared group engine **https://okuhospitalitygroup.com**. This site
never takes a payment. The link logic lives in ONE file: `src/lib/links.ts`.
These paths are already verified against the live group app — use them exactly:

| Button on this site | Must point to |
| --- | --- |
| Reserve (nav, hero, about, footer, reserve section) | `https://okuhospitalitygroup.com/en/reservations` |
| Get Tickets — browse (events with no specific slug) | `https://okuhospitalitygroup.com/en/series` |
| Get Tickets — a specific event | `https://okuhospitalitygroup.com/en/series/<seriesSlug>` |

Important facts so you don't "fix" these into broken links:
- The group's public events page is **`/series`**, NOT `/events`.
- Reservations and series are **not** filtered by `?concept=` or `?venue=` today,
  so link straight to the real pages — do not append those query params.
- Every outbound link must open in a new tab (`target="_blank"
  rel="noopener noreferrer"`), which the kit already does.

**4. Verify the wiring.** After the site runs, click every Reserve and Get Tickets
button and confirm each one opens the correct okuhospitalitygroup.com page above
with a 200 (no 404). Fix any link that does not match the table — but only by
editing `src/lib/links.ts` (and event `seriesSlug` values), nothing else.

**5. Content.** All copy, contact details, hours, menu, gallery, and events live
in `src/data/catch.ts`. The three events are realistic placeholders. To deep-link
a "Get Tickets" button to a real event, set that event's `seriesSlug` to the
actual Series slug from the group site (the slug in
`okuhospitalitygroup.com/en/series/<slug>`). Leave `seriesSlug` empty and the
button safely opens the `/series` browse page.

**6. Launch prep.** Confirm `npm run build` succeeds. Then set up Deployment
(Autoscale is fine — this is a small static-style site) and tell me the steps to
point the custom domain **catchpanama.com** at the deployment.

Do not add analytics, payments, login, or a CMS unless I ask. Keep the site fast,
self-contained, and faithful to the existing design.

---
