# Privacy & Trust — Implementation Task Plan

> This is an engineering privacy audit, not legal advice. It captures
> what the OKÜ codebase implements today, what is missing relative to
> the Panama Law 81 / Decree 285 readiness work in #97, and what should
> be built next. It is **not** a legal opinion and does not replace
> review by qualified Panamanian privacy counsel before launch.

This doc orders the post-#97 work into small, mergeable tasks.
Each task name maps to a roadmap phase from
`compliance-roadmap.md` so traceability is preserved. Acceptance
criteria are **engineering-grade** (testable, scoped) — not legal
opinions.

## Source-tag legend

- `[Official]` — Panama Law 81 of 2019, Decree 285 of 2021, ANTAI
  guidance.
- `[Secondary]` — DLA Piper / Dentons summaries.
- `[Internal inference]` — engineering / product judgement.

## Bank-vs-KYC reminder (verbatim)

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

This sentence must appear on every beneficiary surface delivered by
the tasks below.

## Banesco caveat (verbatim — applies to every export task)

> Banesco bulk-payment export may introduce additional required
> fields. Any new field required by Banesco must be classified before
> implementation and must not be added directly to exports without
> privacy review.

## Phase ↔ priority ↔ launch-blocking matrix

| Phase | Theme | Priority | Launch-blocking |
| --- | --- | --- | --- |
| (a) | Sensitive-access audit + log-scrub guardrail | P0 | Yes |
| (b) | Field-level access hardening + summary permission | P0 | Yes |
| (c) | Privacy notice + trust UI (11 surfaces) | P0 | Yes |
| (d) | DSR register `/admin/privacy/requests` | P1 | No (≤90d) |
| (e) | Processor register `/admin/privacy/vendors` | P1 | No (≤90d) |
| (f) | Retention metadata admin surface | P2 | No |
| (g) | Endpoint hardening (rate limits, session timeout) | P1 | No (≤60d) |
| (h) | Incident-response register + runbook | P0 | Yes |
| (i) | AI data-handling rule + server-side guard | P2 | Only when AI feature is added |

---

# Task ordering principles

`[Internal inference]`

1. **Build primitives before surfaces.** Phase (c) ships ten new
   primitives (see `mobile-trust-ux-plan.md`). They land first; the
   eleven surfaces consume them. The plan splits (c) into (c-0)
   "primitives" + (c-1)…(c-11) "surfaces".
2. **Audit before access change.** Phase (a) ships before phase
   (b) so the new permission split lands on a system that already
   audits restricted reads — avoids a window where queue access is
   tightened but no audit row exists to verify it.
3. **No cross-phase data dependency.** Each task is mergeable on
   its own; later phases can be skipped or reordered without
   leaving a half-state in production.
4. **No new sensitive fields without classification.** Any task
   that would add a Banesco-required field is gated behind the
   verbatim Banesco caveat and must update
   `data-classification.md` first.
5. **Pure-copy work is its own task.** Microcopy and translation
   work is split out from primitive/surface work — designers and
   linguists can land it in parallel.

---

# Tasks

Each task has: **Name** · **Maps to phase** · **Purpose** ·
**Depends on** · **Files likely touched** · **New components vs.
extends existing** · **Acceptance criteria (engineering-grade)** ·
**Risk** · **Priority** · **Launch-blocking**.

---

## T-PRIV-A1 — Sensitive-access audit events

- **Maps to phase.** (a)
- **Purpose.** Add audit rows on every restricted-data **read**
  (beneficiary detail drawer, document signed-URL fetch, queue CSV
  export, future privacy admin surfaces).
- **Depends on.** None.
- **Files likely touched.**
  - `src/server/beneficiaries/beneficiaryService.ts` (new
    `recordDetailViewed` helper).
  - `src/server/beneficiaries/beneficiaryDocumentService.ts`
    (audit on signed-URL grant).
  - `src/app/api/v1/admin/payouts/beneficiaries/[userId]/route.ts`
    (audit on GET).
  - New `src/server/audit/buildBeneficiaryAuditMetadata.ts`
    (typed allowlist helper).
  - `prisma/schema.prisma` — no change.
- **New components vs. extends existing.** Extends existing
  `AuditLog` write paths; adds one typed helper.
- **Acceptance criteria.**
  1. Every successful GET on a restricted-detail route writes a
     single audit row with action
     `admin.beneficiary.detail.viewed` /
     `admin.beneficiary.document.viewed` /
     `compliance.export.beneficiary_queue`.
  2. Failed/forbidden requests do **not** write a viewed-row;
     they write an `*.access_denied` row instead.
  3. Audit metadata uses the new typed allowlist helper —
     unit-tested to refuse extra keys.
  4. Vitest covers: success-row written, denied-row written,
     allowlist refusal.
- **Risk.** Low — additive only.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-A2 — Log-scrubbing guardrail

- **Maps to phase.** (a)
- **Purpose.** Central `scrubLogPayload` helper used by request
  logger + error capture sink.
- **Depends on.** None.
- **Files likely touched.**
  - New `src/server/security/logScrub.ts`.
  - `src/server/beneficiaries/statusEmail.ts` — keep
    `redactEmailForLog` but re-export from `logScrub`.
  - Wherever the global error handler lives (Next.js
    `instrumentation.ts` or Sentry init).
- **New components vs. extends existing.** New helper;
  re-uses pattern of existing `redactEmailForLog`.
- **Acceptance criteria.**
  1. `scrubLogPayload` is a pure function with unit tests that
     prove it strips: long digit runs (≥9), `iv.ct.tag`
     ciphertext shapes, RUC/cedula formats, `Authorization`
     headers, `Cookie` headers, `set-cookie` echoes.
  2. Integrated into the global error handler. A test request
     that throws with a payload containing a fake account number
     produces a log entry that masks the digits.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-B1 — Field-level access split + summary permission

- **Maps to phase.** (b)
- **Purpose.** Introduce `admin:beneficiaries:summary` (queue,
  no detail) and split today's `admin:beneficiaries:read` into
  `:summary` + `:detail`. Add
  `BeneficiaryProfileSummaryView` and use it on the queue.
- **Depends on.** T-PRIV-A1.
- **Files likely touched.**
  - `src/lib/permissions.ts` (or wherever roles ↔ permissions
    are defined).
  - `src/server/beneficiaries/beneficiaryService.ts` (new
    `toSummaryView`; rename `toView` → `toDetailView`).
  - `src/app/api/v1/admin/payouts/beneficiaries/route.ts`
    (queue uses summary view, requires `:summary`).
  - `src/app/api/v1/admin/payouts/beneficiaries/[userId]/route.ts`
    (detail requires `:detail`).
  - `src/components/admin/payouts/BeneficiariesPanel.tsx`
    (queue rendering uses summary type).
- **New components vs. extends existing.** Extends existing
  service and routes; new view type.
- **Acceptance criteria.**
  1. New permission appears in the role registry.
  2. `ADMIN_FINANCE` and `SUPERADMIN` get both `:summary` and
     `:detail`. `ADMIN_COMMERCIAL` gets neither (unchanged).
  3. `BeneficiaryProfileSummaryView` has no field overlap with
     the bank-detail keys (compile-time check via TS).
  4. Vitest: a `:summary`-only caller cannot fetch detail (403),
     can fetch queue, and the queue payload contains no
     bank-detail keys.
- **Risk.** Medium — touches RBAC.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C0 — Trust UI primitives (10 components)

- **Maps to phase.** (c) — primitives only.
- **Purpose.** Land all ten primitives from
  `mobile-trust-ux-plan.md` (TrustCard, VerificationStepper,
  MaskedSensitiveField, PayoutEligibilityStatus,
  RestrictedDataBanner, FinanceReviewDrawer,
  ComplianceHoldBanner, BeneficiaryStatusPill,
  MobileVerificationWizard, PrivacyNoticePanel) and a new
  `privacy` i18n namespace.
- **Depends on.** T-PRIV-B1 (so primitives consume the
  summary/detail split correctly).
- **Files likely touched.**
  - New: `src/components/trust/{TrustCard,VerificationStepper,
    MaskedSensitiveField,PayoutEligibilityStatus,
    RestrictedDataBanner,FinanceReviewDrawer,
    ComplianceHoldBanner,BeneficiaryStatusPill,
    MobileVerificationWizard,PrivacyNoticePanel}.tsx`.
  - New: `src/i18n/translations/{en,es,pt}/privacy.json`
    (EN populated; ES/PT scaffolded).
  - Storybook-style preview entries under
    `artifacts/mockup-sandbox/...` (no main-app routes).
- **New components vs. extends existing.** All new; all wrap
  existing primitives (`StatusChip`, `SlideOverPanel`,
  `AlertStrip`, `PrimaryPanel`).
- **Acceptance criteria.**
  1. Each component has a mockup-sandbox preview at
     375 / 768 / 1280px.
  2. `MaskedSensitiveField` unit test: edit-mode replaces the
     stored value (never appends); read-mode emits the
     screen-reader label "ending in 1 2 3 4".
  3. `PayoutEligibilityStatus` derives from a single
     `evaluatePayoutReadiness` result — no parallel logic.
  4. `RestrictedDataBanner` is non-dismissable; renders the
     verbatim text.
  5. `BeneficiaryStatusPill` uses `StatusChip` underneath; no
     parallel pill exists in the repo (lint).
  6. `PrivacyNoticePanel` loads copy from the new `privacy`
     namespace; renders a "last updated" date.
- **Risk.** Medium — new design surface area.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C1 — Footer privacy link + notice page

- **Maps to phase.** (c-1)
- **Purpose.** Wire the footer link to a single
  `/privacy/notice` page sourcing copy from the `privacy`
  namespace.
- **Depends on.** T-PRIV-C0.
- **Files likely touched.**
  - `src/components/Footer.tsx` (or equivalent).
  - New: `src/app/[locale]/privacy/notice/page.tsx`.
  - `src/i18n/translations/{en,es,pt}/privacy.json`.
- **Acceptance criteria.**
  1. Footer link visible on every public route.
  2. Notice page renders for all three locales.
  3. Last-updated date is sourced from a single constant.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C2 — Newsletter signup widget

- **Maps to phase.** (c-2)
- **Purpose.** Embed `PrivacyNoticePanel` (collapsed) under
  newsletter signup forms.
- **Depends on.** T-PRIV-C0.
- **Files likely touched.** Newsletter signup components on
  marketing pages.
- **Acceptance criteria.**
  1. Panel is collapsed by default and expandable.
  2. EN/ES/PT copy keys present.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C3 — Hiring `data_consent` widget

- **Maps to phase.** (c-3)
- **Purpose.** Add the consent checkbox + helper microcopy.
- **Depends on.** T-PRIV-C0.
- **Files likely touched.** Hiring application form.
- **Acceptance criteria.**
  1. Checkbox is unchecked by default; submit blocked until
     checked.
  2. Application stores a timestamped consent flag.
  3. EN/ES/PT copy keys present.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C4 — Reservation form final step

- **Maps to phase.** (c-4)
- **Purpose.** Add the privacy panel + sentence on the final
  reservation step.
- **Depends on.** T-PRIV-C0.
- **Files likely touched.** Reservation final-step component.
- **Acceptance criteria.**
  1. Panel renders; copy keys present.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C5 — Checkout payment-step privacy panel

- **Maps to phase.** (c-5)
- **Purpose.** Add the panel on the payment step (Cybersource
  or Authorize.net — same copy).
- **Depends on.** T-PRIV-C0.
- **Files likely touched.** Checkout payment step.
- **Acceptance criteria.**
  1. Panel renders identically regardless of active gateway.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C6 — Beneficiary form `/my/beneficiary` (mobile wizard)

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

- **Maps to phase.** (c-6)
- **Purpose.** Replace the single-page form with
  `MobileVerificationWizard`. Verbatim Bank-vs-KYC sentence on
  every screen. `MaskedSensitiveField` for the account number.
  `ComplianceHoldBanner` when on hold.
- **Depends on.** T-PRIV-C0.
- **Files likely touched.**
  - `src/app/my/beneficiary/page.tsx`.
  - `src/components/account/BeneficiarySelfServiceForm.tsx`
    (replaced by wizard wrapper).
- **Acceptance criteria.**
  1. Three-step wizard at 375px with sticky bottom CTA.
  2. Bank-vs-KYC sentence on every screen.
  3. Editing bank coordinates after OKÜ approval triggers the
     existing `applyAutoStatusTransitions` demote and surfaces
     a warning before save.
  4. ComplianceHoldBanner renders when status is `ON_HOLD`.
  5. Existing API `PATCH /api/v1/me/beneficiary` unchanged.
- **Risk.** Medium — replaces a critical form.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C7 — Admin BeneficiariesPanel drawer banner + reason-required modal

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

- **Maps to phase.** (c-7)
- **Purpose.** Wrap the existing drawer with `FinanceReviewDrawer`,
  pin `RestrictedDataBanner`, swap the bank field to
  `MaskedSensitiveField`, and gate every reject/changes/hold
  action behind the typed-reason modal.
- **Depends on.** T-PRIV-A1, T-PRIV-B1, T-PRIV-C0.
- **Files likely touched.**
  - `src/components/admin/payouts/BeneficiariesPanel.tsx`.
  - `src/app/admin/payouts/beneficiaries/page.tsx`.
- **Acceptance criteria.**
  1. Drawer always renders the banner first (visible during
     load skeleton too).
  2. Reject / changes / hold buttons are disabled until reason
     ≥10 chars.
  3. On confirm, the typed reason hits the existing
     `transitionStatus` API; an `*.access_denied` row is
     **not** written on success (covered by T-PRIV-A1).
  4. Approve disabled with tooltip listing missing checks
     (sourced from `evaluatePayoutReadiness`).
- **Risk.** Medium.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C8 — Payout batch export modal copy

- **Maps to phase.** (c-8)
- **Purpose.** Update the export-confirm modal in
  `PayoutBatchesPanel` to render the verbatim Banesco caveat and
  a read-only field-allowlist preview.
- **Depends on.** T-PRIV-C0.
- **Files likely touched.**
  - `src/components/admin/payouts/PayoutBatchesPanel.tsx`.
- **Acceptance criteria.**
  1. Modal shows the verbatim Banesco caveat.
  2. Modal shows the field allowlist (no row dump).
  3. Confirm writes the existing
     `compliance.export.beneficiary_bank_file` audit row (or
     creates it if not yet present, in which case T-PRIV-A1
     adds it first).
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C9 — Referrer dashboard `TrustCard`

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

- **Maps to phase.** (c-9)
- **Purpose.** Add the payout-trust card on the referrer
  dashboard, sourced from `evaluatePayoutReadiness` via a new
  read-only `/api/v1/me/payout-trust` summary route.
- **Depends on.** T-PRIV-C0.
- **Files likely touched.**
  - Referrer dashboard page.
  - New: `src/app/api/v1/me/payout-trust/route.ts`.
- **Acceptance criteria.**
  1. Card renders all six states.
  2. New endpoint returns no bank detail — only the summary
     view (no last-4, no doc statuses).
  3. Bank-vs-KYC sentence under the card.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C10 — Influencer dashboard `TrustCard`

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

- **Maps to phase.** (c-10)
- **Purpose.** Same `TrustCard` shape on the influencer
  dashboard.
- **Depends on.** T-PRIV-C9 (reuses the summary endpoint).
- **Files likely touched.** Influencer dashboard page.
- **Acceptance criteria.** Same as C9, copy adjusted.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C11 — Partner dashboard `TrustCard`

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

- **Maps to phase.** (c-11)
- **Purpose.** Same `TrustCard` shape on the partner dashboard.
- **Depends on.** T-PRIV-C9.
- **Files likely touched.** Partner dashboard page.
- **Acceptance criteria.** Same as C9, copy adjusted.
- **Risk.** Low.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-C-COPY — ES / PT translations for the `privacy` namespace

- **Maps to phase.** (c) — pure-copy.
- **Purpose.** Localize the EN copy delivered by C0–C11 into
  ES and PT.
- **Depends on.** T-PRIV-C0…C11 (keys must exist before
  translation).
- **Files likely touched.**
  - `src/i18n/translations/es/privacy.json`.
  - `src/i18n/translations/pt/privacy.json`.
- **Acceptance criteria.**
  1. No EN key missing in ES/PT (lint).
  2. The verbatim Bank-vs-KYC sentence and the verbatim
     Banesco caveat have agreed-upon ES/PT translations
     reviewed by counsel before merge `[Internal inference]`.
- **Risk.** Low (pure copy).
- **Priority.** P0.
- **Launch-blocking.** Yes (a Spanish-only beneficiary cannot
  see English-only privacy copy at launch).

## T-PRIV-D1 — DSR register `/admin/privacy/requests`

- **Maps to phase.** (d)
- **Purpose.** Lightweight register backing data-subject
  rights requests `[Official]`.
- **Depends on.** T-PRIV-A1, T-PRIV-B1, T-PRIV-C0, T-PRIV-C1.
- **Files likely touched.**
  - `prisma/schema.prisma` — new `PrivacyRequest` model.
  - New: `src/app/admin/privacy/requests/page.tsx`.
  - New API routes for queue + detail + transitions.
  - `AdminNav` — new tab.
- **Acceptance criteria.**
  1. Public intake form on the privacy notice page submits a
     row with rate-limited POST.
  2. Admin queue at `/admin/privacy/requests` with
     `RestrictedDataBanner`, masked subject identity, status
     transitions with typed reasons.
  3. Detail view audited per T-PRIV-A1.
  4. KPI row shows open / overdue counts (Law 81 deadlines).
- **Risk.** Medium.
- **Priority.** P1.
- **Launch-blocking.** No — ≤90 days post-launch.

## T-PRIV-E1 — Processor register `/admin/privacy/vendors`

- **Maps to phase.** (e)
- **Purpose.** Admin surface backed by a small table mirroring
  `cross-border-transfers.md`.
- **Depends on.** T-PRIV-A1, T-PRIV-B1, T-PRIV-C0.
- **Files likely touched.**
  - `prisma/schema.prisma` — new `PrivacyVendor` model.
  - New: `src/app/admin/privacy/vendors/page.tsx`.
  - New API routes (SUPERADMIN-only writes; logged reads).
  - `AdminNav` — new tab.
- **Acceptance criteria.**
  1. Each row carries a link to its section in
     `cross-border-transfers.md`.
  2. AI-handling boolean column drives phase (i)'s guard.
  3. Read access logged.
- **Risk.** Low.
- **Priority.** P1.
- **Launch-blocking.** No — ≤90 days post-launch.

## T-PRIV-F1 — Retention metadata admin surface

- **Maps to phase.** (f)
- **Purpose.** Read-only surface sourcing the canonical
  retention metadata from `data-classification.md` and the
  sweeper's last-run stamp.
- **Depends on.** T-PRIV-C0; coexists with the existing
  retention sweeper (Task #100).
- **Files likely touched.**
  - New: `src/app/admin/privacy/retention/page.tsx`.
  - Reads from sweeper status table or env stamp.
- **Acceptance criteria.**
  1. Per category: retention window, last sweep at, next
     scheduled sweep.
  2. No write actions in this phase.
- **Risk.** Low.
- **Priority.** P2.
- **Launch-blocking.** No.

## T-PRIV-G1 — Endpoint hardening

- **Maps to phase.** (g)
- **Purpose.** Per-route rate limits, role-aware session
  timeout, search/CSV restrictions.
- **Depends on.** T-PRIV-A1, T-PRIV-B1.
- **Files likely touched.**
  - Wherever rate limiting lives (Redis-backed when
    `REDIS_URL` is configured).
  - NextAuth session callback.
  - Any admin queue route accepting `q=`.
- **Acceptance criteria.**
  1. `/api/v1/me/beneficiary` PATCH: 5 req/min/user.
  2. `/api/v1/admin/payouts/active-gateway/test` and
     equivalents: 10 req/min/admin.
  3. `/api/v1/privacy/requests` POST: 5 req/hour/IP.
  4. Sessions holding `admin:beneficiaries:detail` time out
     after 30 minutes idle with a soft `AlertStrip`.
- **Risk.** Medium.
- **Priority.** P1.
- **Launch-blocking.** No — ≤60 days post-launch.

## T-PRIV-H1 — Incident-response register + runbook

- **Maps to phase.** (h)
- **Purpose.** Lightweight `Incident` model and a
  superadmin-only register at `/admin/privacy/incidents`, plus
  a Markdown runbook describing notification thresholds
  `[Official]` for Panama Law 81 incident reporting.
- **Depends on.** T-PRIV-A1, T-PRIV-B1, T-PRIV-C0.
- **Files likely touched.**
  - `prisma/schema.prisma` — new `Incident` model.
  - New: `src/app/admin/privacy/incidents/page.tsx`.
  - New API routes.
  - New: `docs/privacy/incident-response-runbook.md`.
- **Acceptance criteria.**
  1. Register captures: opened, severity, data categories
     touched, actions, notifications sent, closed, lessons.
  2. Runbook lists notification thresholds and on-call
     decision-makers (filled in by counsel + ops; engineering
     leaves placeholders) `[Official]`.
  3. Audit on every read.
- **Risk.** Medium.
- **Priority.** P0.
- **Launch-blocking.** Yes.

## T-PRIV-I1 — AI data-handling rule + server-side guard

- **Maps to phase.** (i)
- **Purpose.** Pin the canonical AI rule in `replit.md`; build a
  server-side guard that strips `banescoAccount*`, full PII,
  and document bytes from any payload sent to a model vendor;
  add a per-user opt-out toggle on `/account`.
- **Depends on.** T-PRIV-E1 (vendor row in register before any
  AI feature ships), T-PRIV-C0.
- **Files likely touched.**
  - `replit.md` — new section pinning the rule.
  - New: `src/server/security/aiPayloadGuard.ts`.
  - `/account` settings page.
- **Acceptance criteria.**
  1. Guard is a pure function with unit tests covering each
     denylist case.
  2. Guard refuses to forward a payload that would carry a
     restricted field; emits an audit row and a developer
     error in non-prod.
  3. Opt-out toggle persists per user; default off.
  4. Rule pinned in `replit.md`.
- **Risk.** Medium.
- **Priority.** P2 — flips to P0 on the first AI feature.
- **Launch-blocking.** No today; yes the moment an AI feature
  is proposed.

---

# Suggested merge order

1. T-PRIV-A1 → T-PRIV-A2 (audit + scrub land first; additive).
2. T-PRIV-B1 (RBAC split lands on an audited surface).
3. T-PRIV-C0 (primitives).
4. T-PRIV-C1…C11 (surfaces) in any internal order; C9/C10/C11
   share the new `/api/v1/me/payout-trust` route, so C9 first.
5. T-PRIV-C-COPY (ES/PT translations) once all keys exist.
6. T-PRIV-H1 (incident register — independent of (c)).
7. **Launch.**
8. T-PRIV-G1 (endpoint hardening, ≤60 days).
9. T-PRIV-D1 (DSR register, ≤90 days).
10. T-PRIV-E1 (processor register, ≤90 days).
11. T-PRIV-F1 (retention metadata, post-launch).
12. T-PRIV-I1 (AI guard, only when first AI feature is proposed).

---

# What this plan does **not** cover

- Any **legal opinion** on whether the implementation satisfies
  Law 81 / Decree 285 — that requires Panamanian counsel review
  and is gated by #97 follow-on legal tasks.
- **Banesco bulk-payment export** as a deliverable. Phase (c-8)
  ships the modal copy and audit; the export adapter itself is
  a separate task once Banesco publishes the field list.
  Verbatim Banesco caveat applies.
- **POS / INVU / PMS** privacy work. Out of scope per #97.
- **Spanish/Portuguese final translations** beyond the privacy
  namespace — broader translation work is a separate program.
- **Visual mockups in image form.** UX is described in
  `mobile-trust-ux-plan.md`; mockups are a follow-on if the
  user wants them.

---

# Cross-doc map

- Functionality + security gap →
  `privacy-functionality-gap-assessment.md`.
- Mobile-first UX, screen-by-screen, component specs, microcopy
  → `mobile-trust-ux-plan.md`.
- Legal/regulatory layer → `panama-law-81-audit.md`,
  `lawful-basis-matrix.md`, `data-classification.md`,
  `cross-border-transfers.md`, `compliance-roadmap.md` (#97).
