# OKÜ Group — Persona-Based UX/UI/Visual QA Audit

**Audit date:** 2026-05-11
**Auditor scope:** discovery / reporting only — no code changes.
**Method:** desktop screenshots of public surfaces (language modal blocks fresh sessions — see P1 finding) + deep code inspection of every persona's entry route, dashboard component, and the relevant API/service layer for trust-critical flows (payments, payouts, tickets, refunds, support).
**Honesty caveats:**
- Mobile viewport screenshots were not produced — the screenshot tool runs at a fixed desktop viewport. Mobile concerns are inferred from CSS/markup and must be validated on a real device before launch.
- Authenticated-route screenshots could not be captured (each screenshot session is isolated; demo-login cookies do not persist between calls). All authenticated findings come from reading the page components and the data they render.
- Dark-mode dimension is not applicable — the admin design system is intentionally light-only ("luxury dashboard"); the public surface has a dark hero aesthetic but is not a true light/dark toggle.

---

## 0. Two-rail payment framing (used throughout this report)

OKÜ depends on **Banesco** for two structurally different things. The audit keeps them separate because the UI must too.

| | **Rail 1 — Inbound (Cybersource)** | **Rail 2 — Outbound (Banesco bulk)** |
|---|---|---|
| **What it does** | Customer card payments: checkout, refund, void, receipt. | Beneficiary payouts: referrer commissions, partner shares, vendor settlements. |
| **Surface** | `/admin/payments` (Superadmin) + customer-facing checkout. | `/admin/payouts` (Superadmin/Finance). |
| **Adapter status in code** | **READY.** `cybersourceAdapter` (charge/refund/void) is live; signed REST calls to `pts/v2/payments|refunds|voids`. Authorize.net adapter also live as fallback. | **PENDING SPEC.** `BANESCO_PANAMA_PENDING_SPEC` registered, renderer throws explicit "awaiting bank spec" error. `CSV_GENERIC` is the only `READY` format. |
| **Pending from Banesco** | Test (sandbox) credentials and final production credentials. | The accepted bulk-payment file format (positional fixed-width? proprietary CSV? Multibank-style XML?), sample file, result/rejection reporting protocol. |
| **Testable today without Banesco** | Settings UI, env switching, save/clear, signed test-connection round-trip (will fail until creds exist), full adapter wiring (charge/refund/void code paths exercise on credential-exception). | Full state machine (DRAFT → PENDING_APPROVAL → APPROVED → EXPORTED), maker/checker enforcement, audit trail, SHA-256 canonical payload, CSV manual handoff to Banesco. |
| **Blocked until Banesco responds** | Real charge/refund/void against test/production cards. End-to-end checkout receipt with a real settlement ID. | Programmatic file delivery, automated reconciliation, automated rejection-row reprocessing. |

This framing matters because **the current UI does not state it anywhere on a single screen.** A finance lead landing on `/admin/payouts` cannot tell that the bank file is "PENDING_SPEC"; a Superadmin landing on `/admin/payments` is shown a Cybersource readiness card with no companion banner explaining that the *outbound* rail is still pending bank input. See finding **UX-CLARITY-01** (P0) below.

---

## 1. Executive summary (read this if you read nothing else)

**Top 5 truths a reasonable user would conclude after 5 minutes on the platform:**

1. *"The product is real, but Panama-launch readiness is gated on what Banesco gives us — and the UI doesn't say so plainly."* The Cybersource rail is wired end-to-end; the Banesco bulk-payout rail is intentionally a stub. There is no single screen that summarises this for a Superadmin or finance operator. They have to know to look in two places (`/admin/payments` and `/admin/payouts`) and infer the rest from microcopy.
2. *"Every public link I share has a wall in front of it."* The first-visit language modal blocks every public route until the visitor picks EN/ES/PT. SEO crawlers, social previews, and one-tap shared links all hit a gate before they can see content. (P1)
3. *"I trust the back office."* The admin shell is consistent (luxury light theme, AdminPageShell, status pills, audit trails), the maker/checker on payouts is real, comp-issue and CSV-export are formula-injection-safe, and the audit pages name their fields well.
4. *"The customer side is much rougher than the back office."* Inline-styled persona dashboards (referrer, influencer, partner) use a different visual vocabulary from the admin. There is design *quality* but not design *consistency*; a guest who becomes a referrer will feel they entered a different app.
5. *"I can't always tell what state my money is in."* On the customer side, `/my/orders` is fine but lacks a refund-status banner when a refund is in flight; on the referrer side, "Earning / Approved / Paid out" is named well but does not explain *when* paid-out will happen — i.e. that it depends on the next batch + Banesco file.

---

## 2. Persona findings

For each persona: who they are, where they land, what works, what's confusing, what's missing.

### 2.1 Unauthenticated guest / SEO crawler

- **Lands on:** `/` → redirects to `/[locale]` (default `/en`). All public pages share the OKÜ Hospitality Group navbar (logo wordmark + Restaurants / Experiences / Memberships / Careers / language / sign-in).
- **What works:** Layout is sophisticated and on-brand; venue gradients on home are tasteful; `/en/restaurants`, `/en/experiences`, `/en/membership`, `/en/careers` all exist and render hero + content.
- **What's broken / confusing:**
  - **P1 — Language modal blocks every fresh session.** Screenshots `01`–`07` all show the same Welcome / Bienvenido / Bem-vindo modal over the actual page. A new guest sees content blurred behind a modal before they can interact. SEO crawlers and social-card previews hit it. *Fix:* respect a default locale from `Accept-Language` (currently the route already has the locale in the URL — the modal should auto-resolve when a locale path is requested) or render the modal as a non-blocking pill in the navbar.
  - **P2 — Many CTAs route through cards-with-links** but several venue cards have low contrast text on photographic backgrounds; will fail WCAG AA on busy hero imagery.
  - **P2 — Footer is dense.** Country/legal/help density is high; not yet validated for reflow at < 360px width.
- **Trust gap:** Public surface does not show currency anywhere except checkout. A guest cannot tell whether listed prices are USD, PAB, or local before clicking a tile.

### 2.2 Member / customer (`attendee@oku.local`, `john@doe.local`, etc.)

- **Lands on:** `/[locale]` (same homepage with a personalised "Welcome back, {firstName}" `MemberHero` and a portal CTA computed by `getDashboardHref(roles)`).
- **Routes:** `/account`, `/my/orders`, `/my/tickets`, `/my/membership`, plus locale-prefixed mirrors.
- **What works:** `/my/orders` and `/my/tickets` are well-named; serialisation is clean; `MyTicketsContent` filters to ISSUED/CHECKED_IN only — a customer never sees confusing legacy statuses.
- **What's broken / confusing:**
  - **P1 — No refund status surface.** A customer whose order has an in-flight refund (`order.refund.succeeded` audit but `Payment.status` not yet REFUNDED, or refund queued behind admin action) sees their order as PAID with no banner. *Fix:* add a "Refund requested · we'll email you when it settles" banner on `MyOrdersContent` when an audit row exists for the order without a settled refund.
  - **P2 — `/my/tickets` shows ticket code + venue but no map / directions / parking copy.** Day-of attendees on mobile commonly need this.
  - **P2 — Account page is locale-aware but uses `cookies().get("oku_locale")` directly rather than the same resolver as the rest of the app — a small consistency risk if the cookie ever drifts from the URL locale.
- **Trust gap:** When a payment fails, the failure copy comes back from the gateway; there's no app-level "what should I do next" microcopy (try another card? contact us?).

### 2.3 Referrer (`r@oku.local`, sidehost / taxi / walkin variants)

- **Lands on:** `/referrer/dashboard` → renders `PayoutDashboard` + `GuestQRPanel` + a long attributions list with friendly status pills.
- **What works:** The `getBookingStatus` and `getCommissionDisplay` mappers are excellent — "Cancelled / No-Show / Dined / Visit Complete / Booking Confirmed / Waitlisted / Awaiting Confirmation" and "Earning / Approved · awaiting payout / Paid out / Not eligible" are exactly the kind of plain-language that earns trust.
- **What's broken / confusing:**
  - **P1 — "Approved · awaiting payout" doesn't say *when*.** This is the single biggest trust gap for the entire referrer cohort. The next batch's date is a Superadmin decision; a referrer has no way to know it's coming next Friday vs in three weeks. With Banesco's file format still PENDING_SPEC, "awaiting payout" might mean "awaiting bank technology". *Fix:* on the referrer dashboard surface "Payouts run on the 1st and 15th. Last batch: {date}. Next batch: {date or 'TBD'}." Source from `PayoutBatch` history.
  - **P2 — No contact/support hand-off.** A referrer with an attribution dispute (guest dined but no commission credited) has no surfaced channel.
  - **P2 — Inline-styled component diverges visually from the admin shell.** Different card radii, different muted-text colour, different font weights. Internally consistent, externally inconsistent with the rest of the platform.
- **Trust gap:** No statement that paid-out commissions reach the referrer's account "via Banesco bulk payout, T+1 to T+3 banking days after the file is sent" (or whatever is true) — this matters for non-employee taxi drivers and sidehosts especially.

### 2.4 Influencer (`influencer@oku.local`, OKÜ-paid track)

- **Lands on:** `/influencer/dashboard` → black gradient hero (different visual language from referrer light theme) + `CommissionEarnerActionPanel` + `PayoutDashboard`.
- **What works:** The "Pending Commission" tile is honest (earned − paid). Conversion-rate microcopy ("23.4% converted") is excellent.
- **What's broken / confusing:**
  - **P1 — Same payout-timing trust gap as referrers.** The "pending → paid" timeline is invisible.
  - **P2 — Two visual languages within minutes.** Hero is "creator/dark/luxe", panels below are "ledger/light/admin". An influencer scrolling sees two products.
  - **P2 — `/influencer/accept-invite` is a separate flow worth a stress test before launch (token state, expired/revoked, already-claimed).
- **Trust gap:** No banner clarifying OKÜ-paid vs Host-Managed track when a user holds both kinds of relationship.

### 2.5 Partner (`partner@oku.local`)

- **Lands on:** `/partner/dashboard` (active series + invite tools).
- **What works:** "Open Invite Tools →" CTAs are visible and primary-coloured.
- **What's broken / confusing:**
  - **P2 — No commission visibility on partner dashboard.** Partner sees their series but not their cumulative earnings vs payouts. They have to deduce it from the same surface as influencers.
  - **P2 — No "next payout" copy.** Same Banesco-rail trust gap as referrer/influencer.

### 2.6 Investor (`investor@oku.local`)

- **Lands on:** `/investor` → list of IR documents with version history.
- **What works:** Document type icons are distinctive; size formatting (B/KB/MB) is correct; locale-aware date formatting.
- **What's broken / confusing:**
  - **P2 — No "last updated" banner at top** — investors want to know "is anything new since I last logged in".
  - **P2 — No download-receipt confirmation** — when an investor clicks a versioned doc, there's no in-app confirmation they got it; they just get a file or an error.
  - **P2 — No language fallback hint** when a document is uploaded only in one language.

### 2.7 Restaurant Host (`host1@oku.local`, `host2@oku.local`)

- **Lands on:** `/host/dashboard` (gated to RESTAURANT_HOST or SUPERADMIN).
- **Inspected:** entry guard is correct; `HostDashboardClient` is a substantial client component (not deeply audited here — flagged for follow-up: see "Out of scope" below).
- **Visible concern:** the host shell uses dark-on-dark and light-on-light alternately; needs a once-over for AA contrast. Mobile usage during service is a primary use case — must be validated on real devices.

### 2.8 Streetside Host (`sidehost@oku.local`)

- **Lands on:** `/host/streetside` → a complex client surface with QR scanner, occasion picker, Panama holidays, loss-reasons taxonomy, concept selector.
- **What works:** Concept theming (OKÜ gold, CATCH cyan, TERRACE green) is consistent and bold; loss reasons are a real taxonomy not free-text — good for analytics; Panama-specific holiday list is a nice touch.
- **What's broken / confusing:**
  - **P1 — High cognitive load on a single screen.** Concept × occasion × holiday × loss-reason × QR is a lot for street-level use. *Fix:* progressive disclosure — start with QR + concept; reveal occasion/holiday/loss only when scenario demands.
  - **P2 — Mobile validation needed.** Streetside is by definition mobile. Cannot screenshot mobile here; flag for real-device QA before any launch.

### 2.9 Staff / check-in (`staff1@oku.local`, `staff2@oku.local`)

- **Lands on:** `/staff/check-in` → dark header bar + dynamic-imported scanner.
- **What works:** Status pill, session selector, last-5 recent-scan chips, atomic ISSUED→CHECKED_IN claim with deterministic `ALREADY_CHECKED_IN` (per replit.md). Scanner is correctly client-only via `dynamic(..., { ssr: false })`.
- **What's broken / confusing:**
  - **P2 — Loading fallback is a bare spinner.** A scanner is a critical-path tool; users need "Initialising camera…" copy and a "no camera permission" explainer.
  - **P2 — Status pill states need an audit pass** — what does each colour mean to a brand-new staff member on their first shift?

### 2.10 Superadmin / Admin Commercial / Admin IR / Admin HR (`admin@oku.local`, `commercial@oku.local`, `panama@oku.local`, `ir@oku.local`, `hr@oku.local`)

- **Lands on:** `/admin` (then routed by role-filtered ACTION_CARDS).
- **What works:** Clean card grid; KPIStatCard is a reusable primitive; cards are role-gated; `/admin/hr` redirects to `/admin/hiring` (consolidation done right).
- **What's broken / confusing:**
  - **P0 — No "two-rail readiness" banner anywhere.** The `/admin` landing shows orders/revenue/users but no "ready for Panama launch" verdict that combines Cybersource (inbound) + Banesco (outbound) + receipts (Resend) + tickets reachable. This belongs on the Superadmin landing as a single trust card. (See **UX-CLARITY-01** below.)
  - **P1 — `/admin/settings/launch-readiness` is a redirect to `/admin/payments`.** Anyone bookmarked or instructed to go to launch-readiness will be silently moved. The destination only addresses Rail 1. There is no equivalent landing for Rail 2.
  - **P2 — Card descriptions ("cardOrdersDesc", "cardPayoutsDesc") are translation keys but not all carry status info** — operators want to see "3 batches awaiting your approval" on the Payouts card without clicking through.

---

## 3. Trust / Payments / Payout clarity (the launch-blocker section)

This is the section the user flagged as highest priority. I went deep here.

### 3.1 Rail 1 — Cybersource (inbound, customer cards)

**Code state (`/admin/payments`, `/api/v1/admin/launch-readiness`, `src/server/payments/activeGateway.ts`):**

- Both `cybersourceAdapter` and `authNetAdapter` exist and implement `charge / refund / voidPayment` against real REST endpoints. ✓
- `getActiveCheckoutGateway()` returns per-provider `{configured, blockers, source, environment, lastTest, selectable, lockedReason}` plus aggregated `{active, ready, blockers}`. ✓
- For OKÜ Panama, active gateway is flipped to `CYBERSOURCE` by `ensureCybersourceActiveForPanama`; schema default stays `AUTHORIZE_NET` to prevent any future tenant-aware refactor from silently forcing Cybersource on every tenant. ✓
- Selectability requires a *recent* passing test — 7 days for sandbox/test, 24 hours for production. ✓ Sentinel `CYBERSOURCE_ADAPTER_LIVE` will hard-block selection if any of charge/refund/void is ever stubbed in future. ✓
- Refunds and voids route by `Payment.provider` on the original record — never re-resolved through `getActiveCheckoutGateway()`. ✓ This is correct behaviour; flagged in `replit.md` Gotchas.

**UI surface in `/admin/payments` Overview:**

- "Active checkout gateway" card: provider + environment pill, "Ready for checkout" yes/no pill, credential source. ✓
- Per-provider rows for Authorize.net + Cybersource: configured / enabled / mode / last test result. ✓
- "Receipts (Resend)", "Tickets reachable", "Gateway-first refunds/voids" rows. ✓
- "Refunds & Voids" tab lists website-only refundable orders (TICKET/EXPERIENCE/EVENT/MEMBERSHIP — DINING/PRIVATE_BOOKING correctly excluded as POS/INVU). ✓

**What a Superadmin can tell from the UI today:**

- ✓ Whether each provider is configured (credentials saved + decryptable).
- ✓ Whether each provider is enabled.
- ✓ The environment (sandbox/test/production) per provider.
- ✓ Whether the last test connection passed and when.
- ✓ Which provider is currently *active* for new charges.
- ✓ Whether the active provider is *ready* for checkout right now.
- ✓ A history of audit events (`payment.gateway.cybersource.{update,clear,test.succeeded,test.failed}`, `payment.gateway.active.changed{,.rejected}`).

**What a Superadmin *cannot* tell from the UI today:**

- ✗ "The credentials currently saved are *demo / placeholder* values supplied by us, not real Banesco-supplied test credentials." There is no "credential provenance" badge.
- ✗ "Real test credentials from Banesco have not yet arrived; you can save them here when they do." There is no waiting-on-bank state.
- ✗ "You can swap from sandbox to production in this same form." This is true (the env toggle exists) — but no copy says "this is the same form for both environments; you do not need a separate panel to go live."
- ✗ A single "Cybersource readiness checklist" with check / pending / blocked icons for: creds saved → test passed (within recency window) → enabled → selected as active → first real charge captured.

### 3.2 Rail 2 — Banesco bulk payouts (outbound, beneficiaries)

**Code state (`src/server/payouts/exportFormats/`, `src/server/payouts/payoutBatchService.ts`):**

- Format registry has three entries:
  - `BANESCO_PANAMA_PENDING_SPEC` — status `PENDING_SPEC`, label "Banesco Panamá (bulk payments)", note "Awaiting Banesco's accepted bulk-payment file spec. Recordable, not yet renderable."
  - `NACHA_US` — status `PLANNED`.
  - `CSV_GENERIC` — status `READY`. "One row per recipient. Use this as a fallback while bank-native adapters are pending."
- The Banesco renderer **deliberately throws** with an explicit message — comment block says exactly what is needed to wire it up later (replace throw → flip descriptor status to READY → set contentType + fileExtension).
- The state machine + canonical export payload + SHA-256 + maker/checker enforcement are all bank-agnostic and complete. ✓
- Comment in `types.ts`: "The schema column `PayoutBatch.exportFormat` is a free-form String so we can add new formats without a migration." ✓ (Good architectural call.)

**UI surface in `/admin/payouts`:**

- AdminPageShell with subtitle: "Maker/checker enforced — submitter cannot approve their own batch. Every state change is audit-logged. The bank file format is selected per export — no default — and recorded with a deterministic SHA-256 of the canonical payload."
- KPI row: Drafts / Awaiting approval / Approved · ready to export.
- In-flight + Completed tabs.
- Format selection happens at export time (per-export, not a system default). ✓

**What a finance operator can tell from the UI today:**

- ✓ How many batches are in each state.
- ✓ Maker/checker is enforced.
- ✓ Audit trail is captured.
- ✓ The list of available formats appears in the export dialog.

**What a finance operator *cannot* tell from the UI today (this is the central Rail-2 finding):**

- ✗ "**Banesco's bulk-payment format is awaiting confirmation from the bank.** Until it arrives, you can record an exported batch with format `BANESCO_PANAMA_PENDING_SPEC` (intent only — no file is rendered) or use `CSV_GENERIC` for a manual upload via the Banesco web portal." This sentence does not exist anywhere in the UI.
- ✗ The status (`READY` / `PENDING_SPEC` / `PLANNED`) of each format is in code (descriptor) but is **not surfaced in the export dialog**. An operator can pick `BANESCO_PANAMA_PENDING_SPEC` and the system will record a batch as exported without producing a file — they will only learn this when they go looking for the file.
- ✗ "What you can test today" — the maker/checker workflow, the canonical SHA-256, the CSV manual handoff — is not labelled as such. A finance lead does not know "this is the part that will work day one without the bank".
- ✗ Nothing on this screen explains the relationship to Cybersource. They are different rails and that's intentional, but a fresh Superadmin will not know that.

### 3.3 Cross-rail UI clarity findings (numbered for tracking)

- **UX-CLARITY-01 (P0):** No single screen explains the two-rail dependency on Banesco. *Fix:* add a "Panama launch readiness" card on `/admin` (Superadmin-only) that contains:
  - Rail 1 Cybersource: real creds saved? • test connection passed (recency)? • active for checkout?
  - Rail 2 Banesco bulk: file spec received? (currently "Pending — awaiting bank") • CSV fallback ready (always Yes) • last successful payout file sent?
  - Receipts (Resend) configured.
  - Tickets reachable.
  - Optional: APP_ENCRYPTION_KEY present.
- **UX-CLARITY-02 (P1):** `/admin/payouts` should render a top banner: *"Banesco bulk-payment file format is awaiting bank confirmation. CSV manual handoff is available today; Banesco-native rendering will become available once the bank confirms their accepted spec."*
- **UX-CLARITY-03 (P1):** Format-selection dialog at export time should show the descriptor `status` next to each option (a green pill for READY, an amber pill for PENDING_SPEC, a grey pill for PLANNED) and refuse to let the operator pick PENDING_SPEC without confirming "I understand no file will be generated; only intent will be recorded."
- **UX-CLARITY-04 (P1):** `/admin/payments` Cybersource card should show a "Credential provenance" row: `Demo placeholder` / `Operator-saved (test)` / `Operator-saved (production)` so the team knows whether the saved creds are real Banesco-issued ones.
- **UX-CLARITY-05 (P2):** Cross-link between `/admin/payments` and `/admin/payouts` with one-line copy: *"Different rails: this page handles **inbound** card payments (customers paying you). For **outbound** payouts (you paying referrers/partners/vendors) see /admin/payouts."* And the inverse on payouts.

---

## 4. P0 Blockers (must fix before launch)

| ID | Finding | Surface | Why P0 |
|---|---|---|---|
| **UX-CLARITY-01** | No two-rail launch-readiness card. | `/admin` (Superadmin) | A go/no-go decision today requires hopping between two pages and inferring the rest. This is the single biggest control-room gap. |
| **TRUST-REFUND-01** | No customer-side refund-status banner on `/my/orders`. | Customer | Once a real refund flow runs (Cybersource), customers will email asking "did my refund go through?" and operators will spend hours answering. |
| **DEMO-GATE-01** | Verify `DEMO_MODE_ENABLED` is unset and `NODE_ENV=production` in Reserved-VM deployment env BEFORE the first public link is shared. | Production env | replit.md flags it as a gotcha; the demo-login back-door currently issues sessions for any seeded `*@oku.local` email. Catastrophic if it leaks. |

(Note: the launch-readiness page being a *redirect* is not P0 because the redirect target does work. The P0 is that the target only covers Rail 1.)

---

## 5. P1 Pre-launch (high pain, ship before public traffic)

| ID | Finding | Surface |
|---|---|---|
| **UX-CLARITY-02** | Top banner on `/admin/payouts` declaring Banesco file-spec status. | Finance |
| **UX-CLARITY-03** | Format-selection dialog shows READY/PENDING_SPEC/PLANNED + confirms intent-only choices. | Finance |
| **UX-CLARITY-04** | Credential provenance row on Cybersource form. | Superadmin |
| **PUBLIC-MODAL-01** | Language modal blocks fresh sessions / SEO / shared links. | Guest |
| **TRUST-PAYOUT-01** | Surface "next batch date" on referrer / influencer / partner dashboards (so "Approved · awaiting payout" has a *when*). | Earner |
| **STREETSIDE-COG-01** | Progressive disclosure on `/host/streetside` — too much on one screen for street use. | Streetside Host |
| **PUBLIC-CONTRAST-01** | Audit hero/card text contrast against photographic backgrounds (WCAG AA). | Public |

---

## 6. P2 Post-launch (improvements, not blockers)

- **UX-CLARITY-05** Cross-link between payments and payouts pages.
- **PUBLIC-FOOTER-01** Mobile reflow audit on the footer.
- **MEMBER-NAV-01** Add a "What's new" surface on `/investor` and `/account`.
- **STAFF-CHECKIN-01** Better camera-init copy on the scanner; explainer when permission is denied.
- **VISUAL-CONSISTENCY-01** Reconcile two visual languages (admin light shell vs creator dark hero) on influencer/referrer dashboards. Pick a primitive set — `src/components/ui/dashboard/` already exists for this — and migrate the inline-styled persona pages to it.
- **HOST-CONTRAST-01** Run a contrast pass on dark-on-dark sections of the host shell.
- **I18N-COVERAGE-01** Spot-check ES and PT translations for completeness on persona dashboards (auth, account, my/orders, my/tickets in particular).
- **INVESTOR-DOWNLOAD-01** Confirmation toast on document download.
- **REFERRER-SUPPORT-01** "Dispute an attribution" entry point.

---

## 7. Visual design system observations

- **Admin shell** (`AdminPageShell`, `AdminNav`, light luxury theme defined in `globals.css`) is consistent, well-spaced, uses status pills with a clear semantic palette (`#dcfce7/#166534` ok, `#fef3c7/#92400e` warn, `#fee2e2/#991b1b` err, `#e2e8f0/#1e293b` neutral).
- **Public shell** has a deliberate dark-on-light luxury aesthetic; venue gradients (OKU/CATCH/TERRACE) are distinctive and on-brand.
- **Persona dashboards** (referrer/influencer/partner) drop the admin shell *and* the public shell and use inline styles. They look good in isolation but break the platform's visual coherence. There is a primitive set in `src/components/ui/dashboard/` (`KPIStatCard` etc) being used by `/admin` — these persona pages should adopt it.
- **Status pills** are used inconsistently across panels — `RefundsVoidsPanel` defines its own `Pill` component, `PayoutBatchesPanel` defines its own `STATUS_LABELS` colour map, the admin payments page defines a third. *Recommendation:* extract one `<StatusPill variant="ok|warn|err|neutral|info">` primitive and use it everywhere.

---

## 8. Mobile UX observations (caveat: inferred from CSS)

- **Public pages** use `clamp()` headings and relative widths — should reflow well, but the language modal at fixed width 520-ish px will look fine on mobile; the underlying blurred page may produce horizontal scroll.
- **Streetside Host** is the most mobile-critical surface and currently has a desktop-style information density. **Must** be tested on a real iOS device before deploying to street operators.
- **Staff check-in** uses a dark top bar + scanner viewport — the dark bar is good for contrast in low light. Spinner-only loading state is the main concern.
- **Customer my/orders + my/tickets** appear to use card layouts that should reflow fine; ticket QR codes need to be tested for readable size at small viewport widths.
- **Admin shell** is desktop-first by design and that is the right call (back-office work happens on laptops).

**Action item:** before Reserved-VM deployment, do a real-device pass on: streetside, staff check-in, my/tickets (the QR scan-at-door scenario), reservations wizard.

---

## 9. Support / communication gaps

- No in-app support entry point for any persona (no "Help" or "Contact" link from referrer/influencer/partner/host dashboards).
- No customer-facing copy explaining what to do when a card is declined.
- No self-serve "request a refund" surface — refund flow is admin-initiated only. (This may be intentional for hospitality; if so, the UI should say so: *"Need a refund? Email contact@…"*.)
- No status page / planned-maintenance banner mechanism.

---

## 10. Screenshots index

| File | Page | Notes |
|---|---|---|
| `screenshots/audit/01-public-home.jpg` | `/` | Language modal blocks home. |
| `screenshots/audit/02-public-en-home.jpg` | `/en` | Same modal — locale-prefixed routes don't bypass. |
| `screenshots/audit/03-public-restaurants.jpg` | `/en/restaurants` | Modal still blocking; restaurant cards visible blurred behind. |
| `screenshots/audit/04-public-experiences.jpg` | `/en/experiences` | Modal blocking; experience cards visible blurred behind. |
| `screenshots/audit/05-public-membership.jpg` | `/en/membership` | Modal blocking; cookie consent banner visible at bottom. |
| `screenshots/audit/06-public-careers.jpg` | `/en/careers` | Modal blocking; jobs filter visible blurred behind. |
| `screenshots/audit/07-public-login.jpg` | `/en/login` | Modal blocking even the sign-in surface — a returning user can't get past it. |

(Authenticated-route screenshots not captured — see "Honesty caveats" at top.)

---

## 11. Recommended fix order (the actual rollout sequence)

1. **Confirm production env hardening** — `DEMO_MODE_ENABLED` unset, `NODE_ENV=production`, `RELEASE_SHA` set, `APP_ENCRYPTION_KEY` set. (DEMO-GATE-01.) *Half a day, ops-only.*
2. **Two-rail launch-readiness card on `/admin`** combining Cybersource + Banesco bulk + Resend + tickets. (UX-CLARITY-01.) *Half a day, copy + one server endpoint to aggregate.*
3. **Banesco-aware copy on `/admin/payouts`** — top banner + format-selection statuses + intent-only confirmation. (UX-CLARITY-02, -03.) *Half a day, mostly copy.*
4. **Customer refund-status banner on `/my/orders`.** (TRUST-REFUND-01.) *One day, requires audit-row lookup.*
5. **Language modal: respect locale path / Accept-Language.** (PUBLIC-MODAL-01.) *Half a day.*
6. **Next-batch-date copy on referrer / influencer / partner dashboards.** (TRUST-PAYOUT-01.) *Half a day.*
7. **Real-device mobile pass on streetside, staff check-in, my/tickets, reservations.** *One day.*
8. **Visual-consistency cleanup on persona dashboards** — adopt `src/components/ui/dashboard/` primitives + extract a single `<StatusPill>`. *Two days, not blocking.*

Items 1–6 are the launch path. Items 7–8 are the immediate post-launch hardening.

---

---

## 12. Field-test findings (user persona walkthrough, 2026-05-13)

The user did their own multi-persona walkthrough after the audit was delivered and surfaced three concrete P0 bugs plus three P1 trust/UX issues. Diagnosis + fixes captured here.

### 12.1 P0-1 — `/staff/check-in` crashes for the Staff demo persona ("Something went wrong")

- **Symptom:** Staff persona reaches `/staff/check-in`; the page renders the dark header, then the scanner area shows "Something went wrong" — the root `app/error.tsx` boundary catching a render error from `CheckInScanner`.
- **Root cause status:** **Not yet conclusively identified.** Both candidates (a missing `html5-qrcode` package, a missing translation namespace) are ruled out — the package is installed at `^2.3.8`; `src/i18n/translations/en/checkin.json` exists and the staff layout loads it. The error-capture endpoint (`POST /api/v1/error-capture`) returns 200 in the dev logs but the `ErrorCapture` Prisma table does not exist (the only error-shaped table in the public schema is `IntegrationSyncError`) — so the server-side captures appear to be silently dropped. **This is itself a bug worth tracking** (P1: ERROR-CAPTURE-01).
- **Fix shipped (defensive):** Added `src/app/staff/check-in/error.tsx` — a route-scoped error boundary that:
  - Replaces the generic root "Something went wrong" with a clear "Check-in scanner failed to load" panel.
  - Offers a Retry and a Back-to-Staff-Portal action.
  - In `NODE_ENV !== "production"`, prints the error message, digest, and full stack trace inline so the next reproduction is diagnosable without Prisma access.
  - Continues to POST to `/api/v1/error-capture` so once that endpoint is repaired, captures will flow.
- **Next step:** repro the crash with the staff demo (`staff1@oku.local`) with the new boundary in place — the inline stack will name the failing call. Then convert the diagnostic boundary into a proper "Camera unavailable / Permission denied" UX.

### 12.2 P0-2 — Restaurant Host bounced from `/staff/check-in` to login

- **Symptom:** `host1@oku.local` (RESTAURANT_HOST) clicks the demo-login link with `callbackUrl=/staff/check-in` and lands on `/en/login?callbackUrl=%2Fstaff%2Fcheck-in` instead of the scanner.
- **Root cause:** Real inconsistency between three layers of access control:
  - `src/lib/permissions.ts` grants `tickets:checkin` to `RESTAURANT_HOST`. ✓
  - `src/app/staff/layout.tsx` allows anyone with `tickets:checkin` OR `RESTAURANT_HOST` role. ✓
  - `src/middleware.ts` `ROLE_ROUTES` for `/staff` was `["SUPERADMIN", "STAFF_OKU", "STAFF_CATCH"]` — **`RESTAURANT_HOST` and `ADMIN_COMMERCIAL` were missing.** ✗
  - The middleware runs *before* the layout. RESTAURANT_HOST hit middleware → redirected to `/login` → never reached the layout that would have welcomed them.
- **Fix shipped:** added `RESTAURANT_HOST` and `ADMIN_COMMERCIAL` to the `/staff` middleware allowlist so all three layers agree:

  ```ts
  // src/middleware.ts
  { prefix: "/staff", allowed: ["SUPERADMIN", "STAFF_OKU", "STAFF_CATCH", "RESTAURANT_HOST", "ADMIN_COMMERCIAL"] },
  ```

- **Verification:** Next.js dev server restarted to pick up the middleware change. `host1@oku.local` should now reach `/staff/check-in` (and from there, hit P0-1's defensive error boundary which will surface the real scanner stack if it still crashes).
- **Lesson for the codebase:** The middleware `ROLE_ROUTES` and the layout role checks are duplicated authorization sources. Recommend a follow-up to derive both from `src/lib/permissions.ts` so they cannot drift again. Filed as **AUTH-DRY-01 (P2).**

### 12.3 P0-3 — `/admin/payments` shows "Active checkout: Authorize.net · not ready" for OKÜ Panama

- **Symptom:** Superadmin opens `/admin/payments`. Active gateway card reads "Authorize.net · not ready" even though OKÜ Panama is supposed to be Cybersource-led per the P5a launch plan in replit.md.
- **Root cause:** Two compounding factors:
  - The seed step `ensureCybersourceActiveForPanama` (prisma/seed.ts:2416) only flips the `CommerceSettings` row when (a) it still holds the schema default `AUTHORIZE_NET` AND (b) no operator override audit row exists. The current dev DB row was at `AUTHORIZE_NET` with no override — but **the seed has not been re-run since this step was added**, so the flip never happened.
  - There are no Cybersource credentials saved (`CybersourceGatewayCredential` table is empty — no Banesco creds yet, as expected). So even after the active gateway is `CYBERSOURCE`, the readiness card will correctly read "not ready" until credentials are saved + tested.
- **Fix shipped (immediate):** Manually flipped the singleton row:

  ```sql
  UPDATE "CommerceSettings" SET "activeCheckoutGateway" = 'CYBERSOURCE' WHERE id = 'global';
  -- Confirmed: returns 'CYBERSOURCE'.
  ```

  After page reload, `/admin/payments` will read "Active checkout: Cybersource · not ready — Cybersource credentials not yet supplied by Banesco" (per the existing blocker logic in `getActiveCheckoutGateway`). That readiness state is now *honest about the launch dependency* — it correctly says "active provider is Cybersource, but the credentials needed to take charges are pending" rather than misleadingly pointing at Authorize.net.
- **Note on the audit row:** I attempted to write a `payment.gateway.active.changed` audit row for the manual flip but `AuditLog.actorId` is `NOT NULL`. The flip is recorded in this audit document instead. When credentials arrive and an operator does the flip via the UI, the audit row will be written normally.
- **Follow-up before launch:**
  1. Save real Banesco-supplied Cybersource test credentials in `/admin/payments → Cybersource`.
  2. Run the test connection (must pass within the recency window — 7d sandbox / 24h production).
  3. Toggle the credential to active. The card will then show "Active checkout: Cybersource · ready".
  4. When production credentials arrive, repeat in production environment with the production-acknowledgement checkbox.

### 12.4 P1 field findings (carried into the main P1 list above)

- **REFERRER-STATUS-01** (P1): Referrer bookings show contradictory status language — rows simultaneously labelled "Visit Complete" and "Awaiting visit", with blank table totals. *Action:* audit `getBookingStatus` + `getCommissionDisplay` mappers to ensure they cannot produce contradictory headline + sub-line on the same row, and ensure `/api/v1/referrer/bookings` populates totals.
- **REFERRER-SUPPORT-01** (P1, was P2 — promoting): Referrer portal has no Support / Dispute / Need help path. Promoting from P2 to P1 because the user explicitly flagged it as launch-relevant for missing-attribution disputes, payout questions, profile corrections, and QR issues.
- **TICKET-SHOW-AT-DOOR-01** (P1, new): On `/my/tickets`, the "show this QR at the door" affordance is not visually obvious from the DOM. A guest at the door fumbling on a phone screen needs the QR to be the primary visual element, not nested under metadata. *Action:* hoist the QR; add explicit "Show this at the door" label above it.

### 12.5 What the user called out as already good

Worth recording so we don't regress these:

- Referrer QR flow: QR-first, WhatsApp share, copy-link — strong product instinct, keep this pattern.
- `/admin/tickets`: search, filters, comp-ticket action, session export — useful and clear.
- Partner dashboard ordering: invite tools first, KPIs lower, session-level actions clear.
- Refunds & Voids panel: website-only scoping, demo-only blocking, provider-aware controls — clear.

### 12.6 Updated launch fix-order (supersedes §11 for the immediate next steps)

1. ~~P0-3 active gateway flip~~ — **done** (this session).
2. ~~P0-2 RESTAURANT_HOST `/staff` middleware allowlist~~ — **done** (this session).
3. **P0-1 reproduce scanner crash** with the new diagnostic error boundary, capture the stack, and ship the real fix (likely camera-permission UX).
4. **P1 ERROR-CAPTURE-01** — wire `/api/v1/error-capture` to a real Prisma model so production crashes are not silently dropped.
5. Then proceed with the original §11 sequence: two-rail readiness card on `/admin`, Banesco-aware copy on `/admin/payouts`, customer refund-status banner, language modal, next-batch-date copy, mobile pass.

---

## Out of scope of this audit (flag for follow-up)

- Deep audit of `HostDashboardClient` (substantial client component, deserves its own pass).
- Sponsorship marketplace, brand-partners apply flow, sales/sell pages — surveyed only at file level.
- Reservation wizard step-by-step flow — surveyed only at the entry route.
- Hiring/applications flow (`/admin/hiring/*`) — surveyed only at file inventory.
- INVU operator screens — referenced in replit.md as a separate observer-mode subsystem; deserves an integration-trust pass of its own.
- Email content (Resend templates) — receipts and post-checkout comms.
- Accessibility (WCAG) deep audit — only obvious contrast issues flagged.
- Performance / Core Web Vitals — out of scope.
