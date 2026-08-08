# Compliance Roadmap — Sequenced Follow-Up Tasks

> **This is an engineering privacy audit, not legal advice.** Final
> interpretation, retention periods, consent wording, and cross-border
> transfer language must be reviewed by Panama counsel.

> **Source-tag legend.** `[Official]` = Law 81 / Decree 285 text **and**
> ANTAI (Panama government regulator) guidance / FAQs. `[Secondary]` =
> law-firm summaries (DLA Piper, Dentons, etc.). `[Internal inference]`
> = engineering interpretation pending counsel review.

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

> **Banesco verbatim caveat.** *"Banesco bulk-payment export may introduce
> additional required fields. Any new field required by Banesco must be
> classified before implementation and must not be added directly to
> exports without privacy review."*

---

## How this roadmap is sequenced

The phase letters **(a)–(i) match the canonical spec in
`.local/tasks/task-97.md`** so each follow-up task is a clean,
mergeable slice — not a 10-area mega-PR. Each item has:

- **Phase ID** (`(a)` … `(i)`).
- **Why** — Law 81 principle / vendor obligation it discharges.
- **Blocks paid launch?** — Yes / No.
- **Depends on** — earlier phases or counsel/DPO sign-off.
- **Scope boundaries** — what is *not* in this phase.
- **Acceptance criteria** — what the merge must demonstrate.
- **EN UI copy** (where applicable), with each string mapped to the
  *exact* target surface in the codebase. ES + PT translations land in
  the same task in `src/i18n/translations/{es,pt}/privacy.json`.

> **Pre-launch operational tasks (not numbered, but blocking):**
> appoint DPO, execute DPAs with Replit / Resend / Cybersource / Sentry
> (if enabled) / Cloudmersive (if enabled), and confirm Cloudmersive is
> contracted in no-retention / no-training mode. These are not
> engineering tasks but no engineering phase below ships its
> *user-facing* parts before they are done.

Launch-blocking phases: **(a), (b), (c), (h)**. Post-launch hardening:
**(d), (e), (f), (g), (i)**.

---

## (a) Sensitive-access audit events + log-scrubbing guardrail *(blocking)*

- **Why.** Accountability + integrity (Law 81 Art. 5) `[Official]`.
  Today most write-paths audit, but read-paths over RESTRICTED_COMPLIANCE
  data do not — and there is no automated check that
  `AuditLog.metadata`, error-capture payloads, console output, or
  analytics events stay free of PII / decrypted bank data / document
  contents / résumé text.
- **Blocks paid launch?** Yes.
- **Depends on.** Pre-launch operational tasks.
- **Scope boundaries.** No new permissions in this phase (that's `(b)`);
  no new UI in this phase (that's `(c)`).
- **Acceptance criteria.**
  - New audit actions covering RESTRICTED_COMPLIANCE *reads*:
    - `beneficiary.read` (admin/finance reads any other user's profile)
    - `beneficiary.document.read` (signed-URL issuance for a document)
    - `payment.gateway.credential.read` (decryption of any gateway
      secret)
    - `application.{created, stage_changed, withdrawn}` (closes the
      hiring audit gap noted in `data-classification.md` §17)
  - A log-scrubbing guardrail (helper module + CI smoke test) that
    refuses to write `AuditLog.metadata`, Sentry event, console output,
    or analytics event when the payload matches the
    RESTRICTED_COMPLIANCE patterns (PAN-shaped digits, SWIFT/BIC
    pattern, key-shaped base64, RUC/cédula pattern).
  - Existing call sites enumerated in `data-classification.md` §17
    pass through the guardrail.
  - Automated audit-log anomaly alerter
    (`src/server/audit/anomalyDetector.ts` +
    `anomalyAlerter.ts`, scheduled every 15 minutes by
    `worker/jobs/audit-anomaly-scan.ts`) covers the patterns
    documented in `incident-response/RUNBOOK.md` §1.2 — pages via
    the same `captureMessage` sink as Sentry alerts and writes an
    `audit.anomaly.alert` evidence row linking the source AuditLog
    ids that triggered the signal.
- **EN UI copy.** None (server-side).

---

## (b) Field-level access hardening + `admin:beneficiaries:summary` permission *(blocking)*

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

- **Why.** Data minimisation + integrity (Art. 5) `[Official]`. The
  audit found two concrete over-exposures:
  1. `getOwnProfile()` returns `adminVerificationNotes` and document
     statuses to the data subject; we want the subject to see *status*
     but not free-text admin notes.
  2. `ADMIN_COMMERCIAL` today either sees full beneficiary detail or
     nothing — it should see a summary (display name + readiness
     status) but not bank coordinates.
- **Blocks paid launch?** Yes.
- **Depends on.** None.
- **Scope boundaries.** No new audit events (those are in `(a)`); no
  notice page changes (those are in `(c)`).
- **Acceptance criteria.**
  - New permission string `admin:beneficiaries:summary` added to
    `src/lib/rbac.ts`. Granted to `ADMIN_COMMERCIAL`. Returns
    `{displayName, bankReadinessStatus}` only — never bank coordinates,
    never document statuses, never `adminVerificationNotes`,
    `complianceHoldReason`, or `last4`.
  - `toView()` in `src/server/beneficiaries/beneficiaryService.ts`
    splits into `toSelfView()` (no `adminVerificationNotes`) and
    `toAdminView()` (full).
  - `GET /api/v1/me/beneficiary` returns `toSelfView()`.
  - `GET /api/v1/admin/payouts/beneficiaries/[userId]` returns
    `toAdminView()` for `ADMIN_FINANCE`/`SUPERADMIN`, summary for
    `admin:beneficiaries:summary`, 403 otherwise.
  - Free-text drift hint banner shown under: `User.internalNotes`
    editor, `BeneficiaryProfile.adminVerificationNotes` (admin),
    `BeneficiaryProfile.complianceHoldReason` (transition modal),
    `OrderNote.body`, `JobApplication.notes`. **EN copy:**
    *Operational context only — do not paste account numbers, document
    contents, or other sensitive data here.*

---

## (c) Privacy notice + trust UI on beneficiary / referrer / partner screens *(blocking)*

- **Why.** Transparency + cross-border-transfer disclosure (Art. 5,
  Art. 33–35) `[Official]`. Without these surfaces an attendee or
  beneficiary cannot know data flows to Cybersource/Resend/Banesco.
- **Blocks paid launch?** Yes.
- **Depends on.** Pre-launch DPO appointment (notice cites DPO contact).
- **Acceptance criteria.**
  - New page `src/app/[locale]/privacy/page.tsx`. Sections:
    1. Who we are (controller identity)
    2. DPO contact
    3. What we collect and why (mirrors `lawful-basis-matrix.md`)
    4. Lawful bases
    5. Cross-border transfers (mirrors `cross-border-transfers.md` §4)
    6. How long we keep your data (mirrors target-state retention from
       `data-classification.md`; surface only — no auto-delete in this
       phase, see `(f)`)
    7. Your rights and how to exercise them
    8. ANTAI complaint route
    9. Changes to this notice
  - JSON translations: `src/i18n/translations/{en,es,pt}/privacy.json`.
  - Footer link wired to `/[locale]/privacy` from
    `src/components/Footer.tsx` (or equivalent).
  - In-product disclosures + trust strings landed at the surfaces
    listed below.
- **EN UI copy** *(every string mapped to the exact target surface)*:

### (c-1) Footer privacy link

- **Surface.** `src/components/Footer.tsx`.
- **EN copy.** `Privacy notice` *(linked to `/[locale]/privacy`)*.

### (c-2) Newsletter signup widget

- **Surface.** Newsletter widget (footer + dedicated page).
- **EN copy.** `By subscribing you agree we may email you about OKÜ
  events and offers. We use Resend (United States) to deliver these
  emails. You can unsubscribe at any time. See our privacy notice.`

### (c-3) Hiring `data_consent` widget

- **Surface.** `src/components/hiring/DynamicField.tsx` `data_consent`
  widget (consent text linked to the privacy notice).
- **EN copy.** `I have read OKÜ's privacy notice and I consent to OKÜ
  processing the information in this application to evaluate my
  candidacy. I understand I can withdraw my application at any time by
  emailing the OKÜ Data Protection Officer.`

### (c-4) Reservation form final step

- **Surface.** Reservation booking wizard final step component.
- **EN copy.** `We use the contact details above to confirm your
  reservation and to coordinate your visit. See our privacy notice for
  details on how long we keep this information and who we share it
  with.`

### (c-5) Checkout — payment step

- **Surface.** Payment step component used by
  `/api/v1/checkout/confirm`.
- **EN copy.** `Your card details are tokenised by Visa Cybersource
  (United States) and never touch our servers. See our privacy notice
  for the full list of vendors involved in your purchase.`

### (c-6) Beneficiary form `/my/beneficiary`

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

- **Surface.** `src/app/my/beneficiary/page.tsx` — intro panel above
  the form.
- **EN copy.** *Beneficiary collection privacy notice.* `What we do
  with this. OKÜ uses your bank coordinates to prepare a payout file
  for Banesco in Panama. Banesco performs the formal banking/KYC/AML
  review when they onboard you as a beneficiary — OKÜ does not perform
  KYC. Your account number is encrypted at rest and only the last four
  digits are ever displayed back to you. See our privacy notice for
  retention windows and your rights.`

### (c-7) Admin BeneficiariesPanel drawer banner

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

- **Surface.**
  `src/components/admin/payouts/BeneficiariesPanel.tsx` — drawer top
  callout.
- **EN copy.** *Restricted compliance data — access is logged.*
  `This drawer shows RESTRICTED_COMPLIANCE data. Access to bank
  coordinates and document evidence is recorded in the audit log. Do
  not paste account numbers, document contents, or screenshots into
  Admin notes — operational context only.`

### (c-8) Payout batch export modal

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

- **Surface.** Wherever the `PayoutBatch` export is triggered for
  download (admin payouts page).
- **EN copy.** `This file contains beneficiary bank coordinates. Treat
  it as RESTRICTED_COMPLIANCE: download only when needed, never email
  it, delete the local copy after the bank file is submitted to
  Banesco.`

### (c-9) Referrer dashboard payout-trust card

- **Surface.** `/referrer` (and the equivalent payout summary card on
  `/influencer`).
- **EN copy.** *Payout trust card.* `How OKÜ handles your payout data.`
  Bullet list (also reused by phase `(c-10)` and `(c-11)` below):
  - `Bank payouts only — funds settle to Banesco in Panama.`
  - `Sensitive fields (account number, ID) are encrypted at rest.`
  - `After save, we display only the last 4 digits.`
  - `OKÜ Finance reviews every payout before it is released.`
  - `Every read of your bank info is recorded in the audit trail.`

### (c-10) Influencer dashboard

- **Surface.** `/influencer` dashboard landing.
- **EN copy.** Reuse `(c-9)` safety checklist + `Your name, handle, and
  public profile fields appear on OKÜ pages where you are credited as
  a host. Your WhatsApp, payout coordinates, and commission details
  are visible only to you and to OKÜ Finance.`

### (c-11) Partner dashboard

- **Surface.** `/partner` dashboard landing.
- **EN copy.** Reuse `(c-9)` safety checklist + `Your delegate seats
  and event-referrer assignments are visible to you and to OKÜ
  Operations. Your payout coordinates, when set, are visible only to
  you and to OKÜ Finance.`

---

## (d) `/admin/privacy/requests` data-subject-request register *(non-blocking)*

- **Why.** Operationalises the Law 81 rights (access, rectification,
  erasure, objection, portability, withdrawal of consent, complaint)
  `[Official, Art. 17–22]`. Today these are honoured by ad-hoc DPO
  emails — sustainable for soft launch, not for steady-state.
- **Blocks paid launch?** No (DPO mailbox + manual log acceptable at
  launch; ship within 90 days).
- **Depends on.** `(c)` (notice cites the request route).
- **Scope boundaries.** Register only — no automated fulfilment in
  this phase (e.g. erasure honouring legal-hold exceptions remains a
  human decision).
- **Acceptance criteria.**
  - New Prisma model `PrivacyRequest` with the **7 request types**:
    `ACCESS`, `RECTIFICATION`, `ERASURE`, `OBJECTION`, `PORTABILITY`,
    `CONSENT_WITHDRAWAL`, `COMPLAINT`. **5 statuses**: `RECEIVED`,
    `IN_REVIEW`, `INFO_REQUESTED`, `FULFILLED`, `REJECTED_WITH_REASON`.
  - Admin page `/admin/privacy/requests` (DPO + SUPERADMIN) listing,
    filtering, transitioning. Every transition writes
    `AuditLog action: privacy.request.{created,transitioned,fulfilled,rejected}`.
  - Public-facing entry surface: a one-line entry in the privacy
    notice with a `mailto:` to the DPO and a tickbox-form alternative
    that opens a `RECEIVED` row.
  - Hiring "withdraw application" link from `(c-3)` opens a
    `CONSENT_WITHDRAWAL` row pre-filled with the application ref.

---

## (e) `/admin/privacy/vendors` processor register *(non-blocking)*

- **Why.** Accountability (Art. 5) + transferability of compliance
  evidence on demand `[Official]`. The data in
  `cross-border-transfers.md` is the seed; this phase moves it into
  the admin product so DPA renewals, sub-processor changes, and
  status-flag updates do not drift from the markdown.
- **Blocks paid launch?** No (markdown is acceptable at launch; ship
  within 90 days).
- **Depends on.** Pre-launch DPA execution.
- **Scope boundaries.** Read/write register UI only — no automated
  vendor scanning, no data-flow diagram generator.
- **Acceptance criteria.**
  - New Prisma model `Processor` with: `name`, `role` (PROCESSOR /
    INDEPENDENT_CONTROLLER / JOINT_CONTROLLER), `region`,
    `dataCategories String[]`, `lawfulBasis`, `dpaStatus`
    (NONE / DRAFT / SIGNED / TERMINATED), `dpaExpiresAt`,
    `subProcessors String[]`, `riskFlag` (1–3), `notes`.
  - Seed migration loads the rows from `cross-border-transfers.md` §2.
  - Admin page `/admin/privacy/vendors` (DPO + SUPERADMIN) — list,
    edit, audit. Every edit writes `AuditLog
    action: privacy.vendor.{created,updated,terminated}`.
  - Public privacy notice section 5 reads from this register at build
    time (or at request time with cache).

---

## (f) Retention-policy metadata surfaced in admin *(non-blocking; no auto-delete in this phase)*

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML. (This phase touches the beneficiary retention windows that depend on Banesco's onboarding lifecycle.)

- **Why.** Storage limitation (Art. 5) `[Official]`. The retention
  numbers in the privacy notice must be visible to admins and to the
  DPO to demonstrate accountability — even before the worker exists.
- **Blocks paid launch?** No.
- **Depends on.** `(c)`.
- **Scope boundaries.** **No automatic deletion in this phase.** The
  enforcement worker is a separate, later task — engineered only after
  the metadata + DPO sign-off + Banesco written confirmation
  (verbatim caveat above) on the document-purge window.
- **Acceptance criteria.**
  - A static `RETENTION_REGISTER` constant in `src/server/privacy/`
    that mirrors the retention column from `data-classification.md`.
  - Admin page `/admin/privacy/retention` showing the register and
    last-review timestamp; quarterly review checkbox writes
    `AuditLog action: privacy.retention.reviewed`.
  - DPO signs each row before the worker can be built.

---

## (g) Endpoint hardening (rate-limit, session timeout, search/CSV restrictions) *(non-blocking; ship within 60 days)*

- **Why.** Integrity + confidentiality (Art. 5) `[Official]`.
- **Blocks paid launch?** No.
- **Depends on.** `(b)` (so the new permission split is the basis for
  the search/CSV gate).
- **Acceptance criteria.**
  - `PATCH /api/v1/me/beneficiary` rate-limited (recommend 5/minute
    per user).
  - Beneficiary admin endpoints rate-limited (recommend 60/minute per
    admin actor) with audit on throttle.
  - Absolute 8-hour session timeout for `ADMIN_FINANCE` and
    `SUPERADMIN` (in addition to existing sliding timeout).
  - Search indexes (any `?q=` parameter on admin lists) explicitly
    deny RESTRICTED_COMPLIANCE fields: account number,
    `adminVerificationNotes`, `complianceHoldReason`, document
    contents.
  - CSV exports follow the same allow-list. Tickets export already
    sanitises formula-injection prefixes (`= + - @ \t \r`); extend the
    same wrapper to every new admin export route.

---

## (h) Incident-response register and runbook *(blocking)*

- **Why.** Breach notification (Art. 31, Decree 285 Art. 38)
  `[Official]`; accountability `[Official]`.
- **Blocks paid launch?** Yes.
- **Depends on.** Pre-launch DPO appointment.
- **Scope boundaries.** Internal documentation only — no admin UI in
  this phase.
- **Acceptance criteria.**
  - New file `docs/privacy/incident-response/REGISTER.md` with one row
    per incident. **Minimum fields:** `incidentId`, `detectedAt`,
    `detectionSource`, `affectedCategories`, `subjectsAffectedCount`,
    `containmentSummary`, `antaiNotificationDecision`,
    `antaiNotifiedAt`, `subjectNotificationDecision`,
    `subjectsNotifiedAt`, `remediation`, `lessonsLearned`,
    `closedAt`, `closedBy`.
  - New file `docs/privacy/incident-response/RUNBOOK.md` covering
    detection sources (Sentry, audit-log anomalies, vendor breach
    notice), containment, the triage decision tree (does this meet
    the Law 81 personal-data-breach threshold?), notification chain,
    post-mortem cadence.
  - ANTAI notification letter template + data-subject notification
    email template — drafted by counsel, stored alongside the
    runbook.
- **EN UI copy.** None (internal documents).

---

## (i) AI data-handling rule + server-side guard *(blocking only when AI feature is added)*

- **Why.** Pre-emptive guardrail so no engineer ships an AI-assisted
  feature without (1) a lawful basis, (2) a vendor row in
  `cross-border-transfers.md` and `(e)`'s register, (3) a redaction
  step that respects the AI exposure verdict in
  `data-classification.md`.
- **Blocks paid launch?** No today (no AI feature shipped). Becomes
  blocking the moment any AI vendor is added.
- **Depends on.** `(e)` (vendor row in register before any AI feature
  ships).
- **Scope boundaries.** The rule + the server-side guard. No AI
  feature is built in this phase.
- **Acceptance criteria.**
  - The rule is documented in `replit.md` under "Architecture
    decisions" and in `docs/privacy/ai-data-handling-rule.md`.
  - A server-side helper `src/server/ai/safeFields.ts` exposes the AI
    exposure tiers (`NEVER` / `SUMMARY_ONLY` / `ALLOWED_WITH_REDACTION`
    / `ALLOWED`) and a `safeForAi(field, value)` function. Any
    outbound HTTP call to a known AI provider must route through this
    helper; CI smoke test asserts that the helper is called on the
    request payload before `fetch`.
  - Opt-out toggle on `/account` honoured on every AI-assisted
    feature.

### The rule (canonical, to be carried verbatim into the doc + `replit.md`)

1. The AI exposure verdict in `data-classification.md` is the source
   of truth for what may be sent to any AI vendor.
   - `NEVER`: hard ban — no prompt, embedding, fine-tune set, or RAG
     index. Includes all RESTRICTED_COMPLIANCE fields, encrypted
     credentials, raw audit metadata, beneficiary documents, résumé
     files.
   - `SUMMARY_ONLY`: aggregate counts and non-identifying summaries
     only.
   - `ALLOWED_WITH_REDACTION`: flows only after a documented redaction
     step (email/phone/name → tokens such as `<email_1>` /
     `<phone_1>` / `<name_1>`).
   - `ALLOWED`: pre-existing public content only.
2. Every AI vendor must be contracted in **no-retention / no-training**
   mode. Verified before the feature ships.
3. Every AI-assisted user-facing feature must offer the data subject
   an opt-out via `/account` and respect it.
4. AI-assisted features must NOT make automated decisions affecting
   the data subject.
5. Any AI summary stored alongside an internal record inherits the
   parent record's retention window.
6. Logs of AI calls (prompt + response) themselves count as INTERNAL
   and are governed by the standard `AuditLog` retention.

### EN UI copy for the future opt-out toggle on `/account`

`Use AI to summarise long messages and notes. When this is on, OKÜ
may send the text of your messages — with names, emails and phone
numbers removed — to a trusted AI vendor that has agreed not to
retain or train on your data. We never send bank coordinates, payout
details, or uploaded documents. You can turn this off at any time.`

---

## Roadmap dependency graph (compact)

```
Pre-launch operational (DPO + DPAs)
├── (a) Audit events + log-scrubbing  [blocking]
├── (b) Field-level access hardening   [blocking]
├── (c) Privacy notice + trust UI      [blocking]
│   ├── (d) DSR register               [≤90 days post-launch]
│   ├── (e) Processor register         [≤90 days post-launch]
│   ├── (f) Retention metadata         [post-launch]
│   └── (g) Endpoint hardening         [≤60 days post-launch]
├── (h) Incident-response register     [blocking]
└── (i) AI data-handling rule          [blocking only on AI feature add]
```

Items **(a), (b), (c), (h)** are launch-blocking. The rest are
post-launch hardening.
