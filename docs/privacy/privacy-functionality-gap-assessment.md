# Privacy, Security & Trust — Functionality Gap Assessment

> This is an engineering privacy audit, not legal advice. It captures
> what the OKÜ codebase implements today, what is missing relative to
> the Panama Law 81 / Decree 285 readiness work in #97, and what should
> be built next. It is **not** a legal opinion and does not replace
> review by qualified Panamanian privacy counsel before launch.

## Source-tag legend

- `[Official]` — Panama Law 81 of 2019, Decree 285 of 2021, ANTAI
  guidance.
- `[Secondary]` — DLA Piper Data Protection Handbook, Dentons Latin
  America privacy summaries, public regulator FAQs.
- `[Internal inference]` — engineering / product judgement about the
  OKÜ codebase, not derived from a legal source.

## How this doc relates to #97

Task #97 produced the legal/regulatory layer:
`panama-law-81-audit.md`, `lawful-basis-matrix.md`,
`data-classification.md`, `cross-border-transfers.md`, and
`compliance-roadmap.md` (phases (a)–(i)). This doc is the engineering
counterpart. It does **not** re-derive the legal analysis — it cites
#97 and concentrates on:

- **Layer 2 — Security controls** already in code, and the gaps.
- **Layer 3 — Product functionality** already in code, and the gaps.
- **Reusable primitives** that the next implementation tasks should
  reuse instead of re-inventing.
- **Risky areas** that look "covered" but are actually exposure
  surfaces.
- A **P0 / P1 / P2 priority recommendation** that aligns with
  roadmap phases (a)–(i).

Mobile-first UX is in `mobile-trust-ux-plan.md`. The mergeable task
breakdown is in `privacy-implementation-task-plan.md`.

## Bank-vs-KYC reminder (verbatim)

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

This sentence is repeated verbatim in every beneficiary subsection
below. It is the line every UI surface, every export, and every
internal note must hold. OKÜ does not do KYC. We make a beneficiary
"bank-ready" so Banesco's onboarding can succeed.

## Banesco caveat (verbatim, applies to every export recommendation)

> Banesco bulk-payment export may introduce additional required
> fields. Any new field required by Banesco must be classified before
> implementation and must not be added directly to exports without
> privacy review.

---

# Layer 2 — Security controls

Each subsection lists **Current** (what exists in the repo today),
**Target** (what good looks like for launch), and **Follow-up** (the
deltas the implementation phase needs to deliver). Severity tag
(P0 / P1 / P2) maps to the priority recommendation at the end.

## 2.1 Encryption at rest (sensitive fields)

**Current** `[Internal inference]`
- `src/server/security/encryption.ts` — AES-256-GCM with
  `APP_ENCRYPTION_KEY` (32 bytes, base64 or utf-8).
  `encryptSecret`, `decryptSecret`, `isEncryptionAvailable`,
  `maskSecret` exported. IV is random per encryption, auth tag
  enforced on decrypt — correct primitive.
- Used for `BeneficiaryProfile.banescoAccountNumberEncrypted`,
  `PaymentGatewayCredential` (Authorize.net), and
  `CybersourceGatewayCredential`. Only `*Last4` hints stored
  unmasked.
- Service guards (`upsertOwnProfile` /
  `adminUpsertProfile`) refuse to save the bank account number when
  `APP_ENCRYPTION_KEY` is unset, instead of silently failing open.

**Target**
- Same pattern extended to any new sensitive field added by
  Banesco (see verbatim caveat above) — **classify first, encrypt
  before persistence**, store only `*Last4` for display.
- Documented key-rotation runbook (currently implicit).
- Operational alarm for "decrypt failed" log line so a key rotation
  mishap is visible rather than silent.

**Follow-up (P0)**
- Write the key-rotation runbook (operational doc; no code).
- Add a structured log scrub assertion that we never log the
  ciphertext or plaintext (covered by phase (a)).

## 2.2 Field-level masking (display side)

**Current** `[Internal inference]`
- Beneficiary admin and self-service screens render
  `•••• <last4>` for the bank account number; the full ciphertext
  never leaves the server (`toView` in `beneficiaryService.ts`
  intentionally drops `banescoAccountNumberEncrypted`).
- Payment gateway settings UI shows `*Last4` only.

**Target**
- A **single** `MaskedSensitiveField` primitive (see
  `mobile-trust-ux-plan.md` §Components) so masking, "reveal last 4
  only", "edit replaces, never appends", and screen-reader labels
  ("ending in 1 2 3 4") are uniform across surfaces.
- Same primitive used for tax ID / RUC, SWIFT, and any new
  Banesco-required field.

**Follow-up (P0)**
- Build `MaskedSensitiveField` (covered by phase (c)).
- Audit every read path that could surface a sensitive value —
  search for direct `banescoAccountNumberEncrypted` references
  outside `beneficiaryService.ts`. Today there are none, but the
  test should be reproducible (lint rule or unit test).

## 2.3 Role-based access control (RBAC)

**Current** `[Internal inference]`
- `RoleKey` enum includes `ADMIN_FINANCE` (separated from
  `ADMIN_COMMERCIAL`) precisely to keep beneficiary/payout reads
  out of the broader admin role. Permissions
  `admin:beneficiaries:read`, `admin:beneficiaries:write`, and
  `admin:payouts:write` already gate the relevant routes.
- `SUPERADMIN` retains a wildcard.
- `ADMIN_COMMERCIAL` does **not** have beneficiary read/write — it
  has commerce/orders/refunds.

**Target**
- Add a finer **summary-only** permission
  (`admin:beneficiaries:summary`) so a queue/list view can show
  status pills + display name without surfacing bank details
  (covered by phase (b)).
- Codify "Restricted compliance data — access is logged" banner on
  every drawer that surfaces full-detail beneficiary data.

**Follow-up (P0)**
- Phase (b): split `read` into `summary` and `detail`; the queue
  becomes summary-only.
- A 1-line lint/test that fails if a server route returns
  `banescoAccountLast4 + bankName + accountHolderName` without the
  `:detail` permission check.

## 2.4 Sensitive-access audit logging

**Current** `[Internal inference]`
- Every state transition + admin upsert + self upsert in
  `beneficiaryService.ts` writes an `AuditLog` row
  (`beneficiary.profile.*`, `beneficiary.transition`).
- Payment gateway changes audit
  (`payment.gateway.{authnet,cybersource}.{update,clear,test.*}`),
  active-gateway switches audit
  (`payment.gateway.active.changed{,.rejected}`).
- Maker/checker payout actions audit through
  `src/server/payouts/payoutAudit.ts`.
- All audits store **only** non-secret diffs and `*Changed: true`
  booleans — never raw values.

**Gap** `[Internal inference]`
- **Reads** of restricted compliance data are not yet audited.
  Today, an admin opening the beneficiary drawer doesn't write a
  row; only writes do.
- No `admin.beneficiary.detail.viewed` event yet.
- No central admin view to browse "who looked at whom, when".

**Target (covered by phase (a))**
- Sensitive-access audit events on every detail-drawer open and on
  every CSV/export of compliance data.
- A central, read-only audit browser at `/admin/privacy/audit`
  (admin permission only) — query by actor, target user, date,
  action.
- A log-scrubbing guardrail in the request logger so plaintext
  account numbers, full tax IDs, and full PII never reach
  application logs even if a future code path forgets the
  redaction.

**Follow-up (P0)**
- Write the sensitive-access events list (one entry per
  restricted view).
- Implement log-scrubbing as a defense-in-depth filter on the
  request logger — pure function, easy to unit-test.

## 2.5 AuditLog hygiene

**Current** `[Internal inference]`
- AuditLog `metadata` is JSON. Conventions today are good
  (booleans, `*Changed`, `before/after` for non-secret fields,
  txid summaries, sanitized error messages) — but they are
  conventions, not enforced.
- Active-gateway PATCH explicitly uses an **allowlist** for
  metadata keys — that pattern is the gold standard.

**Target**
- Apply the allowlist pattern to every audit emitter that touches
  beneficiary or compliance data. A small typed helper
  `buildBeneficiaryAuditMetadata({...})` would prevent a future
  contributor from accidentally JSON-stringifying a Prisma row
  containing the ciphertext.

**Follow-up (P1)**
- Refactor `writeAudit` calls in `beneficiaryService.ts` to a
  per-action typed helper. No behavior change — pure hygiene.

## 2.6 Log/error scrubbing

**Current** `[Internal inference]`
- `redactEmailForLog` exists in `statusEmail.ts` (good pattern,
  but local to that file).
- Other places log `err?.message` directly. Not a leak today, but
  the policy is implicit.

**Gap** `[Internal inference]`
- No central scrub helper. No assertion that
  `err?.stack` (which can include a request body containing a
  plaintext account number) is never sent to a third-party error
  capture sink.

**Target (covered by phase (a))**
- Central `scrubLogPayload` helper used by the request logger and
  by Sentry/Replit error capture, with a denylist of regexes:
  long digit strings, `iv.ct.tag` shapes, RUC/cedula formats,
  `Authorization` headers.

**Follow-up (P0)**
- Pure-function helper + unit tests + integration into the global
  error handler.

## 2.7 Rate limiting

**Current** `[Internal inference]`
- Some endpoints are rate-limited; the policy is per-instance
  unless `REDIS_URL` is configured (already documented in
  `replit.md`).

**Gap** `[Internal inference]`
- No documented rate limit on:
  - `/api/v1/me/beneficiary` PATCH (could be brute-forced to fish
    for last-4 echo).
  - The active-gateway test endpoint.
  - The DSR / privacy request submission form (when (d) lands).

**Target (covered by phase (g))**
- Per-route limits for the beneficiary/admin surfaces. Burst
  protection on the privacy request form.

**Follow-up (P1)**
- Inventory existing limits and add the missing ones in phase
  (g). Out of scope for launch only if (g) is post-launch.

## 2.8 Session timeout

**Current** `[Internal inference]`
- NextAuth defaults; no explicit short timeout on admin sessions.

**Target (covered by phase (g))**
- Short idle timeout (e.g. 30 minutes) for sessions that hold
  `admin:beneficiaries:detail`, with a soft "session expiring"
  banner using the existing `AlertStrip`.

**Follow-up (P1)**
- NextAuth callback to enforce role-aware session lifetime.

## 2.9 API response redaction

**Current** `[Internal inference]`
- Service-layer `toView` functions are the redaction boundary
  (e.g. `beneficiaryService.toView` strips
  `banescoAccountNumberEncrypted`). Good pattern.
- Admin list route `GET /api/v1/admin/payouts/beneficiaries`
  already returns `accountLast4` not the full number.

**Gap** `[Internal inference]`
- Convention is correct but not type-enforced. A `select` slip in
  Prisma could re-introduce the ciphertext.

**Target (covered by phase (b))**
- Two distinct view types: `BeneficiaryProfileSummaryView` (no
  bank detail, no doc statuses, no last4) and
  `BeneficiaryProfileDetailView` (today's `BeneficiaryProfileView`
  but never with ciphertext). Routes pick the view based on the
  caller's permission.

**Follow-up (P0)**
- Add `BeneficiaryProfileSummaryView` + use it on the queue list.

## 2.10 CSV / export redaction

**Current** `[Internal inference]`
- Ticket CSV export sanitizes formula-injection prefixes
  (`= + - @ \t \r`) and audits as `admin.tickets.export`. Good
  baseline.
- Banesco bulk export is **out of scope** for #97 and remains so
  here. There is no current CSV export of beneficiary detail.

**Target**
- A future "bank file" export (Banesco-shaped) must:
  1. Use a typed allowlist of fields (no Prisma row dumps).
  2. Log a `compliance.export.beneficiary_bank_file` audit row
     with field list + row count + actor (no values).
  3. Apply formula-injection sanitization.
  4. Honor the verbatim Banesco caveat.

**Follow-up (P1)**
- Spec only — implementation is a separate task once Banesco
  publishes their final field list.

## 2.11 AI data-handling guardrail

**Current** `[Internal inference]`
- No AI feature ships today. There is no rule, no guard, no
  vendor row, and no opt-out toggle — all of which is correct
  *until* an AI feature is added.

**Target (covered by phase (i))**
- Canonical rule pinned in `replit.md` and in this doc; server-
  side guard that strips `banescoAccount*`, full PII, and
  document bytes from any payload sent to a model vendor;
  per-user opt-out on `/account` for data sent to AI features.

**Follow-up (P2 / P0 the moment an AI feature is proposed)**
- The rule blocks the first AI feature, not the launch.

---

# Layer 3 — Product functionality

## 3.1 Beneficiary verification

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

**Current** `[Internal inference]`
- Self-service `/my/beneficiary` form
  (`src/app/my/beneficiary/page.tsx` →
  `BeneficiarySelfServiceForm`).
- Admin queue `/admin/payouts/beneficiaries` →
  `BeneficiariesPanel` with detail drawer (status pills,
  document statuses, manual transitions with reason).
- Bank-readiness state machine in `beneficiaryService.ts`
  (`MISSING_INFO → READY_FOR_REVIEW → OKU_APPROVED →
  AWAITING_BANK_CONFIRMATION → BANK_READY` plus orthogonal
  `REJECTED` / `ON_HOLD`).
- Auto-promote / auto-revert on info completeness.
- Per-status email via `statusEmail.ts` with locale + opt-out.
- Document upload pipeline with magic-byte sniff and Cloudmersive
  AV scan; PENDING blocks read access.

**Gap** `[Internal inference]`
- No mobile-optimized step-by-step wizard for the beneficiary;
  current form is a single tall page.
- No "Bank vs. KYC" copy on the form itself — beneficiaries
  cannot distinguish OKÜ approval from Banesco onboarding.
- Detail drawer has no "Restricted compliance data — access is
  logged" banner.
- Admin reject / changes-requested / hold do not yet require a
  typed reason in the UI (the API accepts one; the UI does not
  enforce it).
- No payout-eligibility status surfaced on the
  Influencer / Referrer / Partner dashboards beyond the form
  page itself.

**Target (covered by phase (c))**
- `MobileVerificationWizard` for the self-service flow at 375px.
- Reject / changes / hold modal with required typed reason.
- "Restricted compliance data — access is logged" banner via
  `RestrictedDataBanner` on every detail drawer open.
- Payout-trust card on every earner dashboard via `TrustCard` +
  `PayoutEligibilityStatus`.
- Verbatim Bank-vs-KYC sentence on every beneficiary surface.

**Follow-up (P0)** — phase (c).

## 3.2 Payout readiness

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

**Current** `[Internal inference]`
- `evaluatePayoutReadiness()` returns `{ready, status,
  blockingReasons[]}`. `previewBatch` adds blockers
  `BENEFICIARY_PROFILE_MISSING`, `BANK_NOT_READY`,
  `COMPLIANCE_HOLD` and the maker/checker
  (`createDraft`/`submitForApproval`/`approve`) re-checks via
  `assertBeneficiaryReadinessForInfluencers` inside the tx, so a
  beneficiary demoted between draft and approve cannot slip into
  a bank file.
- `PayoutBatchesPanel` exposes the maker/checker UI.

**Gap** `[Internal inference]`
- Blocked rows show "Bank not ready" but not why or what the
  beneficiary needs to do — the message is for the operator, not
  the beneficiary.
- No "Why is this blocked?" deep link from the payout batch
  drawer to the beneficiary drawer.
- No `BeneficiaryStatusPill` + `PayoutEligibilityStatus` shared
  primitive — labels are inlined.

**Target**
- `PayoutEligibilityStatus` with explicit "Eligible / Blocked"
  + a single primary blocker reason.
- Deep link from payout batch drawer to beneficiary detail
  drawer (subject to permission + audit).
- Verbatim Bank-vs-KYC sentence on the payout batch drawer when
  any row is blocked by readiness.

**Follow-up (P0)** — phase (c).

## 3.3 Bank-profile review (Finance / Superadmin)

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

**Current** `[Internal inference]`
- `BeneficiariesPanel` drawer, plus per-document statuses,
  notes, manual transitions with optional reason.
- Sensitive fields are last-4 only; a transition to
  `OKU_APPROVED` requires `isInfoComplete`.

**Gap** `[Internal inference]`
- No reason-required modal for `REJECTED` / `ON_HOLD` transitions.
- No `FinanceReviewDrawer` primitive — the panel is bespoke.
- No "access logged" banner.
- Detail-drawer opens are not yet audited (per (a)).

**Target (covered by phases (a) + (b) + (c))**
- `FinanceReviewDrawer` with banner, masked fields,
  reason-required modals, and an embedded read-only audit ribbon
  ("Last viewed by … on …").

**Follow-up (P0)**.

## 3.4 Payout-policy assignment

**Current** `[Internal inference]`
- Influencer compensation/policy fields live on the influencer
  profile and on commission plan tables; payout cycle is
  enum-bound (`PayoutCycle`).

**Gap** `[Internal inference]`
- Out of #97/#98 scope. Privacy treatment of these fields is
  already covered (no PII; commission rate is an operational
  field, not regulated personal data).

**Follow-up (P2)** — no privacy work needed at launch.

## 3.5 Compliance holds

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

**Current** `[Internal inference]`
- `ON_HOLD` transition writes `complianceHoldReason` and emails
  the beneficiary (HOLD_OR_REJECT bucket — opt-out is ignored,
  always sent).
- `evaluatePayoutReadiness` blocks payouts when `ON_HOLD` even
  if the bank is otherwise ready.

**Gap** `[Internal inference]`
- No banner primitive (`ComplianceHoldBanner`) on the
  beneficiary's own page explaining what is on hold and what
  they can do.
- No clear path for the beneficiary to ask a question — they
  receive an email with a CTA back to the form, but no inline
  help text.

**Target (covered by phase (c))**
- `ComplianceHoldBanner` with reason, what-to-do-next, and
  contact link. Verbatim Bank-vs-KYC sentence.

**Follow-up (P0)**.

## 3.6 Data-subject request register

**Current** `[Internal inference]`
- Does not exist. There is no `/admin/privacy/requests` route,
  no model, no intake form.
- Today, requests would go to the generic contact email — not
  trackable, not auditable.

**Target (covered by phase (d))**
- Lightweight register: a model (request id, subject identity,
  type of right exercised, status, due date, handler, audit
  trail), an intake form linked from the privacy notice, and an
  admin queue at `/admin/privacy/requests`.
- Export controls: same allowlist + audit pattern.

**Follow-up (P1)** — non-blocking; ≤90 days post-launch.

## 3.7 Vendor / processor register

**Current** `[Internal inference]`
- Does not exist as a managed surface. Vendors are listed in
  `cross-border-transfers.md` (#97) — that is the source of
  truth, but it is a doc, not a system.

**Target (covered by phase (e))**
- `/admin/privacy/vendors` admin surface backed by a small
  table; superadmin-only writes; read access logged.
- Each row links its row in `cross-border-transfers.md`.

**Follow-up (P1)** — non-blocking; ≤90 days post-launch.

## 3.8 Retention-policy admin

**Current** `[Internal inference]`
- A retention sweeper exists (Task #100, separate). There is no
  admin surface that lets a SUPERADMIN see "what is retained
  where, for how long, why".

**Target (covered by phase (f))**
- A read-only admin page that surfaces the canonical retention
  metadata from `data-classification.md` per data category, with
  a "last sweep ran at" stamp from the sweeper.
- No auto-delete UI in this phase.

**Follow-up (P2)** — non-blocking; post-launch hardening.

## 3.9 Incident-response register

**Current** `[Internal inference]`
- Does not exist.

**Target (covered by phase (h))**
- Lightweight register (incident id, severity, opened/closed,
  data categories touched, actions, notifications, lessons).
- Admin-only; access logged.
- Runbook doc (no UI) describing notification thresholds.

**Follow-up (P0)** — blocking per #97.

## 3.10 Privacy-request workflow (end-to-end)

**Current** `[Internal inference]`
- The notice text is in the lawful-basis matrix (#97). There is
  no live notice page on the marketing site, no widgets on
  newsletter / hiring / reservation / checkout / beneficiary /
  payout / dashboards.

**Target (covered by phase (c))**
- Footer privacy link, plus per-surface widgets:
  newsletter signup, hiring `data_consent`, reservation final
  step, checkout payment step, beneficiary form,
  beneficiary admin drawer banner, payout export modal,
  referrer dashboard payout-trust card, influencer dashboard,
  partner dashboard.
- Each widget reuses the same `PrivacyNoticePanel` primitive
  (collapsed by default, link to full notice, last-updated
  date).

**Follow-up (P0)**.

---

# Reusable primitives — what to build on

Build on these. **Do not** parallel-implement them.

| Primitive | File | Reuse for |
| --- | --- | --- |
| `AdminPageShell` | `src/components/admin/AdminPageShell.tsx` | Every new admin page (queue, drawer, audit, vendors, requests). |
| `AdminShell` + `AdminNav` | `src/components/AdminShell.tsx` + `AdminNav.tsx` | Add the new admin tabs (Privacy → Requests / Vendors / Audit / Retention). |
| `SlideOverPanel` | `src/components/ui/SlideOverPanel.tsx` | Every detail drawer (beneficiary, request, vendor, incident). |
| `StatusChip` | `src/components/ui/StatusChip.tsx` | Status pills; `BeneficiaryStatusPill` is a thin wrapper around it (do not re-implement). |
| `KPIStatCard` / `MetricCard` / `ModuleCard` / `PrimaryPanel` | `src/components/ui/dashboard/` | Dashboard KPI rows on the new privacy admin pages. |
| `AlertStrip` | `src/components/ui/dashboard/AlertStrip.tsx` | "Restricted compliance data — access is logged" banner; session-expiring soft banner. |
| `encryptSecret` / `decryptSecret` / `maskSecret` / `isEncryptionAvailable` | `src/server/security/encryption.ts` | Any new sensitive field. **Do not** add a parallel cipher. |
| `evaluatePayoutReadiness` | `src/server/beneficiaries/beneficiaryService.ts` | All payout gating. Do not derive readiness anywhere else. |
| `assertBeneficiaryReadinessForInfluencers` | `src/server/payouts/payoutBatchService.ts` | All batch gating; do not duplicate the rule into UI. |
| `writeAudit` (local helper) | `src/server/beneficiaries/beneficiaryService.ts` | Pattern for new audit emitters; lift into a shared `buildBeneficiaryAuditMetadata` helper. |
| `redactEmailForLog` | `src/server/beneficiaries/statusEmail.ts` | Lift into a shared `scrubLogPayload`. |
| `getTranslations` + `Locale` + `DEFAULT_LOCALE` | `src/i18n/*` | Localized notice copy; new `privacy` namespace. |
| `Resend` integration | `src/server/invitation/resend.ts` | DSR acknowledgements; status-change emails. |

---

# Risky areas (look "covered" but are actually exposure surfaces)

`[Internal inference]` for all entries unless tagged.

1. **Free-text drift.** `complianceHoldReason`,
   `adminVerificationNotes`, `BeneficiaryDocument.scanMessage`, and
   any future "rejection note" are free text. They will absorb PII
   over time (operators paste cedulas, etc.). Two mitigations:
   (a) UI placeholder text that says "Do not paste account numbers
   or full ID numbers — use the structured fields." (b) Server-side
   scrub on write that flags long digit runs and warns the actor
   before save (no auto-strip — operator confirms).

2. **Audit hygiene drift.** Audits today rely on a convention of
   "non-secret diffs only". A future PR could `JSON.stringify(row)`
   into `metadata`. Mitigation: a typed
   `buildBeneficiaryAuditMetadata({...})` helper with an allowlist;
   refuse extra keys at the type level.

3. **Masking drift.** Today every read path returns last-4. A
   future Prisma `select` could include `banescoAccountNumberEncrypted`
   "by accident" while serializing for an admin export. Mitigation:
   a `BeneficiaryProfileSummaryView` and a
   `BeneficiaryProfileDetailView` with no field overlapping the
   ciphertext; lint rule on raw model spread.

4. **AI exposure.** First AI feature added without phase (i)'s
   guard would silently send PII to a vendor. Mitigation: pin the
   rule in `replit.md` and require a vendor row + the
   `cross-border-transfers.md` entry as PR checklist gates before
   any AI dependency lands.

5. **CSV / export.** Banesco bulk export is the highest-blast-radius
   future surface. Mitigation: the verbatim Banesco caveat is
   repeated in this doc, in the UX plan, and in the task plan;
   phase (b) hardens the field-level access split *before* phase
   (e) opens a vendor register that could reference the export.

6. **Detail-drawer opens not audited.** Any admin opening the
   drawer today is invisible. Phase (a) closes this; until then,
   treat the gap as known.

7. **Reason-not-required.** API accepts a typed reason for
   reject/hold but the UI does not require it. Phase (c) makes the
   reason mandatory at the form level. Until then, audit metadata
   may show empty `reason` strings.

8. **Locale fallback in beneficiary email.** `resolvePreferredLocale`
   defaults to EN. For Spanish-only beneficiaries this is a copy
   gap, not a privacy gap, but it touches the "Action required"
   bucket — verify ES copy lands in phase (c) along with the new
   surfaces.

---

# Recommended P0 / P1 / P2 priority

Aligned to roadmap phases (a)–(i) from
`compliance-roadmap.md`.

**P0 — Launch-blocking (must ship before public launch).**

- Phase (a) — Sensitive-access audit events + log-scrubbing
  guardrail.
- Phase (b) — Field-level access hardening +
  `admin:beneficiaries:summary` permission split.
- Phase (c) — Privacy notice + trust UI on beneficiary, referrer,
  partner, payout, checkout, hiring, newsletter, reservation
  surfaces. Includes: `MaskedSensitiveField`,
  `RestrictedDataBanner`, `BeneficiaryStatusPill`,
  `PayoutEligibilityStatus`, `MobileVerificationWizard`,
  `FinanceReviewDrawer`, `ComplianceHoldBanner`,
  `PrivacyNoticePanel`, `TrustCard`, `VerificationStepper`.
- Phase (h) — Incident-response register + runbook.

**P1 — Post-launch hardening (≤90 days).**

- Phase (d) — DSR register at `/admin/privacy/requests`.
- Phase (e) — Processor register at `/admin/privacy/vendors`.
- Phase (g) — Endpoint hardening (rate limits, session timeout,
  search/CSV restrictions). Ship within 60 days.

**P2 — Ongoing.**

- Phase (f) — Retention-policy metadata surfaced in admin (no
  auto-delete in this phase).
- Phase (i) — AI data-handling rule + server-side guard. Becomes
  P0 the moment an AI feature is proposed.

---

# Cross-doc map

- Mobile-first UX, screen-by-screen, component specs, and
  microcopy → `mobile-trust-ux-plan.md`.
- Mergeable task breakdown with dependencies, files touched,
  acceptance criteria, risk, and launch-blocking flag →
  `privacy-implementation-task-plan.md`.
- Legal/regulatory layer → `panama-law-81-audit.md`,
  `lawful-basis-matrix.md`, `data-classification.md`,
  `cross-border-transfers.md`, `compliance-roadmap.md` (#97).
