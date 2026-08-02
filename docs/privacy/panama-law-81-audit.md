# Panama Law 81 (2019) — Engineering Audit

> **This is an engineering privacy audit, not legal advice.** Final
> interpretation, retention periods, consent wording, and cross-border
> transfer language must be reviewed by Panama counsel.

> **Source-tag legend.** Every legal claim in this file is tagged with one
> of:
> - `[Official]` — text drawn directly from Law 81 of 26 March 2019 or
>   Executive Decree 285 of 28 May 2021 (the implementing regulation).
> - `[Secondary]` — a reputable secondary source (ANTAI FAQ, ANTAI
>   regulatory notice, DLA Piper *Data Protection Laws of the World* —
>   Panama, Dentons summary).
> - `[Internal inference]` — our engineering interpretation of how the
>   principle applies to OKÜ's actual code paths. These have **not** been
>   reviewed by counsel and should be treated as the weakest tier of
>   evidence.

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.
>
> **Why this distinction matters here (load-bearing across the doc):** OKÜ
> is **not** a Panama-licensed bank, money-transmitter, or KYC authority.
> The "compliance"-style verification we run is a bank-readiness workflow
> that assembles structured information so Banesco can run their own
> formal KYC/AML when they onboard a beneficiary. We never claim to have
> identified the beneficiary for AML purposes — Banesco does. This shapes
> what data we are entitled to collect, how long we keep it, and what we
> can say to the data subject. The verbatim sentence above is repeated in
> every beneficiary-related section of every doc in this folder.

> **Banesco verbatim caveat.** *"Banesco bulk-payment export may introduce
> additional required fields. Any new field required by Banesco must be
> classified before implementation and must not be added directly to
> exports without privacy review."*

---

## 0. Scope of this audit

| Concept | Definition used in this document |
| --- | --- |
| **Current state** | What the codebase does today, observable in `prisma/schema.prisma`, `src/server/**`, and `src/app/api/v1/**` at the date of this audit. |
| **Target state** | What the platform needs to do at the moment OKÜ Panama goes live for paid attendees + beneficiary payouts. |
| **Follow-up state** | Post-launch hardening that is desirable but not blocking for first paid order — sequenced in `compliance-roadmap.md`. |

The audit covers only the OKÜ Panama production tenant. Other future
ReferrerOS markets are explicitly out of scope.

---

## 1. Material scope (Art. 1 / Art. 2) `[Official]`

Law 81 applies to the processing of personal data carried out in the
territory of Panama, or by a controller established in Panama, regardless
of where the data subject resides `[Official]`. The implementing decree
extends the law to controllers outside Panama who target their services
at residents of Panama `[Secondary, DLA Piper Panama]`.

**OKÜ position `[Internal inference]`:** OKÜ Panama operates a hospitality
group physically located in Panama City; staff, hosts, restaurants, and
beneficiaries are predominantly Panamanian residents. Even if some
infrastructure (Replit, Postgres, Resend, Cybersource gateway, Sentry,
object storage) is hosted outside Panama, the controller is in scope.

---

## 2. Definitions and roles

### 2.1 Controller and processor `[Official]`

Law 81 distinguishes the *responsable del tratamiento* (controller) from
the *encargado del tratamiento* (processor) `[Official]`.

| Role | Who | Evidence |
| --- | --- | --- |
| **Controller (target)** | OKÜ Panama legal entity | — |
| **Processors (current)** | Replit (compute + DB hosting), Resend (transactional email), Cybersource / Visa (card processing), Banesco (payout settlement, but Banesco is also an independent controller for its own KYC), object storage (Replit-managed GCS bucket), Sentry (if enabled), any AI vendor used for support summarization | See `cross-border-transfers.md` for the full vendor map. |

**Gap.** No signed Data Processing Agreement (DPA) is on file with any of
the above vendors today. Resend, Cybersource, and Replit each publish a
standard DPA — these need to be executed and stored. `[Internal
inference]`

### 2.2 Sensitive data `[Official]`

Law 81 Art. 4 defines sensitive data to include data revealing racial or
ethnic origin, political opinions, religious beliefs, union membership,
health, biometric data, and sexual orientation `[Official]`. Financial
account data is **not** automatically sensitive under Panamanian law in
the way that GDPR Art. 9 categorises it — but ANTAI's guidance treats
bank account numbers as data that carries elevated harm potential and
warrants encryption-at-rest `[Official, ANTAI FAQ §III]`.

**OKÜ position `[Internal inference]`:** We collect no Art. 4 sensitive
data today. The closest categories we collect are:

- **Bank coordinates** (`BeneficiaryProfile.banescoAccountNumberEncrypted`,
  `bankName`, `accountHolderName`, `accountType`, `currency`,
  `swiftBic`) — financial, not Art. 4 sensitive, but treated as
  `RESTRICTED_COMPLIANCE` in `data-classification.md`.
- **Identification document evidence** (`BeneficiaryDocument` rows in
  private object storage) — these can incidentally contain ID numbers,
  date of birth, and photo. We treat these as `RESTRICTED_COMPLIANCE`.
- **Hiring data** (`JobApplication.resumeUrl`) — résumés can incidentally
  contain Art. 4 fields. We do not request sensitive data; if a candidate
  volunteers it on their résumé we treat the file as `RESTRICTED_COMPLIANCE`
  and the privacy notice for `/jobs` will state that we will not use
  voluntary sensitive disclosures as a basis for hiring.

---

## 3. Lawful bases (Art. 5–7) `[Official]`

Law 81 recognises six lawful bases roughly mirroring GDPR Art. 6:

1. Consent of the data subject `[Official]`
2. Performance of a contract to which the subject is party `[Official]`
3. Compliance with a legal obligation of the controller `[Official]`
4. Vital interests of the subject `[Official]`
5. Public interest task `[Official]`
6. Legitimate interests of the controller, balanced against the rights
   of the subject `[Official]`

**Per-purpose mapping** lives in `lawful-basis-matrix.md`.

### 3.1 Consent quality `[Official]`

Consent must be free, informed, specific and **revocable at any time**
`[Official, Art. 5]`. The implementing decree Art. 12 requires a *clear
affirmative act* — pre-ticked boxes do not count `[Official]`.

**Current state.**

- Hiring forms collect a `data_consent` widget rendered by
  `src/components/hiring/DynamicField.tsx` — affirmative, granular per
  consent text. ✅
- Newsletter signups (`NewsletterSubscription`) collect an explicit
  email opt-in. ✅
- `UserProfile.marketingOptIn` defaults to `false` and is only flipped by
  explicit user action. ✅
- Checkout (`/checkout/confirm`) does **not** present any consent text
  today. The lawful basis for checkout itself is contract performance,
  so consent is not required for the transaction — but the *transfer*
  of payment data to Cybersource (US) needs a transfer-mechanism notice.
  ❌ `[Internal inference]`
- `/my/beneficiary` does not present any consent text today; the lawful
  basis is "performance of a contract" (we cannot pay you without your
  bank coordinates), but the data subject still has a Law 81 right to
  be told what we do with it. ❌ `[Internal inference]`

**Target state.** A Panama-specific privacy notice must be reachable from
every form that submits personal data, plus a one-line disclosure on the
checkout payment step and on `/my/beneficiary`. UI copy is staged in
`compliance-roadmap.md` §C.

### 3.2 Withdrawal of consent `[Official]`

Withdrawal must be as easy as giving consent `[Official, Art. 5]`.

**Current state.** Newsletter has a one-click unsubscribe link. Marketing
opt-in is togglable from `/account`. Beneficiary status emails have a
self-service `statusEmailOptOut` flag (P1 of the Banesco workflow). For
hiring `data_consent`, today there is no self-serve withdrawal — the
applicant has to email us. ❌ `[Internal inference]`

**Target.** Add a "Withdraw consent / delete my application" affordance
on the hiring confirmation screen — sequenced in roadmap phase (d) — DSR register entry.

---

## 4. Principles (Art. 5) `[Official]` — principle-by-principle

For every principle below: *Current state*, *Target state*,
*Follow-up*.

> **Severity legend.** Each principle below carries a P0/P1/P2 tag for
> the *gap* — not the principle itself. **P0** = launch-blocking; **P1**
> = ship within 60 days of paid launch; **P2** = ongoing hardening.

### 4.1 Lawfulness, fairness, transparency `[Official]` — **P0**

- **Files to touch (next task).** `src/app/[locale]/privacy/page.tsx`
  (new); `src/i18n/translations/{en,es,pt}/privacy.json` (new);
  `src/components/Footer.tsx` (link); newsletter widget;
  `src/components/hiring/DynamicField.tsx`; reservation booking wizard
  final step; checkout payment step component;
  `src/app/my/beneficiary/page.tsx`;
  `src/components/admin/payouts/BeneficiariesPanel.tsx`.
- **Current state.** No public privacy notice exists at `/privacy` for
  the Panama tenant. Vendors are not disclosed.
- **Gap.** No lawful-basis surface; cross-border transfers undisclosed;
  no consent UI for newsletter or hiring.
- **Target.** Bilingual (ES/EN, with PT optional) privacy notice
  published at `/[locale]/privacy`, listing controller identity, DPO
  contact, purposes, lawful bases, retention windows, vendor list, data
  subject rights, and the ANTAI complaint route. Linked from the footer,
  hiring forms, checkout, `/my/beneficiary`, and newsletter widgets.
- **Follow-up.** Periodic review cadence (annual + on material change)
  recorded in the privacy-document register.

### 4.2 Purpose limitation `[Official]` — **P1**

- **Files to touch (next task).** `docs/privacy/lawful-basis-matrix.md`
  (already created — keep in sync); CONTRIBUTING note in `replit.md`
  ("every new PII field requires a row in `data-classification.md`
  and a purpose row in `lawful-basis-matrix.md`"); CI process check.
- **Current state.** Purposes are documented only implicitly via code —
  we collect bank info to pay you, ID doc evidence to satisfy Banesco's
  KYC, etc. There is no central purpose register.
- **Gap.** No enforced PR-time check that new PII fields land with a
  purpose entry.
- **Target.** `lawful-basis-matrix.md` becomes the canonical purpose
  register. Any new feature that introduces a new purpose adds a row.
- **Follow-up.** Engineering convention: every new Prisma field that
  stores PII or financial data MUST be added to `data-classification.md`
  in the same PR. (This is a process rule, not a code rule.)

### 4.3 Data minimisation `[Official]` — **P1**

- **Files to touch (next task).** Hiring form templates in
  `prisma/seed.ts` (`FormTemplate` rows — make `phone` optional);
  admin notes write surfaces — `src/server/beneficiaries/beneficiaryService.ts`
  (`adminVerificationNotes`), `OrderNote` editor in admin order drawer,
  `JobApplication.notes` editor — drift-hint banners.
- **Current state per field.** Verdicts are recorded per row in
  `data-classification.md`. The notable findings:
  - `JobApplication.phone` is collected on every job form — verdict
    `OVER-COLLECTED for non-phone-contact roles`. Recommendation: make
    optional unless the job's `FormTemplate` requires it.
  - `User.internalNotes` is a free-text field with no schema. Verdict
    `RISK: drift toward over-collection`. Recommendation: an admin UI
    hint ("do not paste sensitive data here").
  - `BeneficiaryProfile.bankName / accountHolderName / accountType /
    currency / swiftBic` are necessary for the Banesco file. ✅ Verdict
    `MINIMAL — keep`.
  - `BeneficiaryProfile.banescoAccountLast4` — necessary as a display
    proxy so admins can confirm "yes, this is the right account" without
    decrypting. ✅ `MINIMAL`.
  - `Order.coversCount`, `attributionId`, attribution UTM params — not
    PII; analytics-class data. ✅
- **Target.** Make `JobApplication.phone` optional unless required by
  the form template; add the admin-notes hint banner.
- **Follow-up.** Quarterly data-min review of every new field added in
  the previous quarter. Sequenced in roadmap phase (g) — endpoint hardening.

### 4.4 Accuracy `[Official]` — **P2**

- **Files to touch (next task).** `src/app/[locale]/privacy/page.tsx`
  (correction-request link); DPO `mailto:` constant.
- **Current state.** Users can self-edit name and phone via `/account`
  and bank coordinates via `/my/beneficiary`. Beneficiaries cannot
  self-edit their document statuses (admin only — by design).
- **Gap.** No documented correction route for fields the data subject
  cannot self-edit.
- **Target.** Add a "request correction" link in the privacy notice
  pointing to the DPO email for fields that are not self-serviceable
  (notably document statuses, audit trail, internal notes).

### 4.5 Storage limitation (retention) `[Official]` — **P1**

- **Files to touch (next task — phase (f) metadata only, NOT auto-delete).**
  New `src/server/privacy/retentionRegister.ts`; new
  `src/app/admin/privacy/retention/page.tsx`; new
  `AuditLog action: privacy.retention.reviewed` write site.
  **Worker is a separate later task** gated on DPO sign-off + Banesco
  written confirmation per the verbatim caveat above.

Law 81 requires retention only for the time necessary for the purpose,
and disposal thereafter `[Official, Art. 5]`. ANTAI's FAQ recommends a
documented retention schedule per data category `[Official, ANTAI FAQ
§II]`.

- **Current.** No retention policy is implemented. `User.deletedAt`-style
  soft-delete fields exist on some models (`BeneficiaryDocument.deletedAt`)
  but there is no scheduled job that prunes by age, and there is no
  documented retention table.
- **Target.** Per-class retention defaults (codified in
  `data-classification.md` "Target retention" column) and a daily
  cron-style worker that enforces them. Suggested defaults:
  - Operational PII (User, UserProfile): kept while account active +
    24 months after last login, then anonymised.
  - Order/Payment financial records: 7 years (Panama tax/commercial
    record retention `[Secondary, Dentons Panama tax overview]`).
  - Beneficiary bank coordinates: kept while account active + 24 months
    after last successful payout, then deleted.
  - Beneficiary documents (object storage): purged 90 days after
    `BANK_READY` is achieved, since Banesco then becomes the system of
    record. **Pending Banesco's written confirmation** that they accept
    OKÜ purging once they have onboarded the beneficiary — see verbatim
    Banesco caveat at top.
  - AuditLog: 24 months minimum (we need at least one annual review
    cycle), then archive.
  - ApplicationSubmission / JobApplication: 12 months from final
    decision unless candidate consents to a longer talent-pool window.
- **Follow-up.** Retention enforcement worker — roadmap phase (f) — retention metadata; auto-delete worker is a later task gated on DPO sign-off + Banesco written confirmation.

### 4.6 Integrity and confidentiality (security) `[Official]` — **P0** (rate-limit + finance role narrowing); **P1** (audit hash-chain, key-rotation runbook)

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

- **Files to touch (next task).** `src/lib/rbac.ts` (new permission
  `admin:beneficiaries:summary`); `src/server/beneficiaries/beneficiaryService.ts`
  (split `toView()` → `toSelfView()`/`toAdminView()`/`toSummaryView()`);
  `src/app/api/v1/me/beneficiary/route.ts`;
  `src/app/api/v1/admin/payouts/beneficiaries/[userId]/route.ts`;
  `src/server/security/encryption.ts` (key-rotation runbook —
  documentation only); `src/middleware.ts` (rate limit on
  `PATCH /api/v1/me/beneficiary` — recommend 5/min); admin endpoint
  rate limits (recommend 60/min); session timeout config for
  `ADMIN_FINANCE`/`SUPERADMIN`.
- **Current state.** AES-256-GCM via `APP_ENCRYPTION_KEY` for: Banesco
  account number, Authorize.net credentials, Cybersource credentials,
  INVU credentials, payment-gateway shared secrets. Implementation
  reviewed in `src/server/security/encryption.ts` — sound (random IV,
  authenticated tag, key length validation).
- **Current.** Beneficiary documents in private object storage at
  `/<bucket>/private/beneficiary-docs/<profileId>/<uuid>`, not reachable
  through the public media proxy.
- **Current.** Role-based access enforced at middleware level
  (`src/middleware.ts`) and route level (RBAC strings in
  `src/lib/rbac.ts`). Beneficiary endpoints require `ADMIN_FINANCE` /
  `SUPERADMIN`.
- **Current.** `next-auth` JWT sessions, `httpOnly` + `secure` cookies in
  production.
- **Gaps `[Internal inference]`:**
  - No absolute session timeout (only sliding). Recommend 8-hour
    absolute for finance/admin roles.
  - Beneficiary self-service endpoints (`PATCH /api/v1/me/beneficiary`)
    are **not rate-limited** — see `src/server/rateLimit.ts` which is
    only wired to public POSTs. An attacker with a stolen session could
    flood account-number rotations. Recommend per-user 5/minute limit.
  - No audit-log-tamper protection (no append-only WORM). Recommend
    nightly hash-chain export to object storage with date-stamped names.
  - No documented key rotation procedure for `APP_ENCRYPTION_KEY`.
  - No encryption-in-transit *enforcement* between app and Postgres
    today (TLS is available but not asserted by code).
- **Target.** Close the four gaps above before paid launch. Document
  the procedure for rotating `APP_ENCRYPTION_KEY` (re-encrypt-in-place
  migration script, dual-key window).
- **Follow-up.** Annual penetration test scoped to admin and finance
  surfaces; quarterly access review of `ADMIN_FINANCE` membership.

### 4.7 Accountability `[Official]` — **P0**

- **Files to touch (next task).** New `src/server/privacy/logScrub.ts`
  (helper + RESTRICTED-pattern regexes); call-site instrumentation in
  every audit write listed in `data-classification.md` §17;
  `docs/privacy/incident-response/REGISTER.md` and
  `docs/privacy/incident-response/RUNBOOK.md` (new); read-audit
  actions `beneficiary.read`, `beneficiary.document.read`,
  `payment.gateway.credential.read`, `application.{created,stage_changed,withdrawn}`
  added in their respective service files.

Law 81 Art. 5 requires the controller to be able to *demonstrate*
compliance `[Official]`.

- **Current.** Comprehensive `AuditLog` model used for almost every
  finance-relevant write (beneficiary profile changes, transitions,
  payout batch lifecycle, payment gateway changes, refunds, voids,
  comp-ticket issuance, ticket CSV export, role changes via
  `UserAuditLog`). ✅
- **Gaps.**
  - No record-of-processing register (Art. 30-style).
  - No DPO appointed.
  - No incident-response register or runbook.
  - No DPIA template for new high-risk features.
- **Target.** Stand up the four artefacts above before launch. The
  matrix and classification documents in this folder constitute the
  initial record-of-processing.

---

## 5. Data subject rights (Art. 17–22) `[Official]`

Law 81 grants the data subject these rights `[Official]`:

| Right | Article | Current support | Target |
| --- | --- | --- | --- |
| **Access** | 17 | Partial: users can view their `User`, `UserProfile`, `InfluencerProfile`, `BeneficiaryProfile` (last4 only) via dashboards. No machine-readable export. | DPO-mediated export script that bundles all rows keyed by `userId` into a JSON file; honoured within 15 business days `[Official, ANTAI FAQ §V — recommended timeline]`. |
| **Rectification** | 18 | Self-serve for name, phone, bank coordinates, influencer profile fields. | Add "request correction" route to privacy notice for non-self-serve fields. |
| **Erasure** | 19 | None today. `User.suspendedAt` / `lockedAt` exist but do not delete data. | DPO-mediated erasure honouring legal-hold exceptions: orders/payments retained 7 years for tax; beneficiary records retained as long as outstanding payout obligations exist. Out-of-scope rows (newsletter, applications) deletable on request. |
| **Objection** | 20 | Marketing opt-out via `marketingOptIn`. Beneficiary status-email opt-out via `statusEmailOptOut`. | No additional surface required at launch. |
| **Portability** | 21 | None. | Same export script as Access. |
| **Cancellation of consent** | 22 | Newsletter unsubscribe; marketing toggle. Hiring `data_consent` cannot be withdrawn self-serve. | Add hiring withdrawal flow — roadmap phase (d) — DSR register entry. |
| **Right not to be subject to automated decisions** | — | Not applicable today: we make no automated rejection decisions on hiring or beneficiaries. AI-assisted summarisation, when introduced, must not cross into automated decision-making — see roadmap phase (i) — AI data-handling rule. | — |

ANTAI is the supervisory authority and the route for complaints
`[Official, ANTAI website]`. The privacy notice MUST surface ANTAI's
contact details so data subjects can complain to the regulator.

---

## 6. Cross-border transfers (Art. 33–35) `[Official]`

Law 81 permits cross-border transfers when the recipient country offers
adequate protection, when standard contractual clauses are in place,
when the subject has consented to the transfer, or when the transfer is
necessary for performance of a contract `[Official]`.

ANTAI has **not** published an adequacy list; the practical pattern is
to rely on the vendor's published DPA + standard contractual clauses, or
on contract-performance / consent grounds, and to *disclose* the
transfer in the privacy notice `[Secondary, DLA Piper Panama]`.

Full vendor inventory and lawful-basis-per-transfer in
`cross-border-transfers.md`.

---

## 7. Breach notification (Art. 31) `[Official]`

Law 81 requires notification to the supervisory authority and, where
appropriate, to affected data subjects, in the event of a personal data
breach `[Official]`. The implementing decree clarifies that the
notification must be made *without undue delay* once the controller
becomes aware `[Official, Decree 285 Art. 38]`. Secondary commentary
suggests a 72-hour informal target, mirroring GDPR practice
`[Secondary, DLA Piper Panama, Dentons summary]` — Panama has not
codified a hard hour-count.

- **Current.** No breach runbook, no register, no template letter to
  data subjects, no template ANTAI notification. ❌
- **Target.** Stand up an incident-response register (file:
  `docs/privacy/incident-response/REGISTER.md`) and a one-page runbook
  describing detection → containment → notification triage → ANTAI
  filing. Both are sequenced in roadmap phase (h) — incident-response register.

---

## 8. Sanctions `[Secondary]`

DLA Piper reports that ANTAI sanctions for Law 81 violations range from
**USD 1,000 to USD 10,000 per violation**, scaled by gravity, recurrence
and the controller's size `[Secondary, DLA Piper Panama]`. Repeat
offenders can face suspension of processing activities `[Secondary,
ANTAI regulatory notice]`.

This is much smaller than GDPR-scale fines but is enough — at the
per-violation rate — to be material if a single batch incident affects
hundreds of beneficiaries.

---

## 9. Open questions for counsel + DPO

Listed here so the engineering team does not silently assume answers.

1. Does Banesco itself become a joint controller for the bank-readiness
   data we hand them, or a downstream independent controller?
2. Does ANTAI consider the AES-256-GCM-encrypted `banescoAccountNumberEncrypted`
   row a "personal data record" for the purposes of breach notification
   if the encryption key is not also exposed?
3. Is the 7-year retention assumption for `Order` / `Payment` correct
   for OKÜ Panama under DGI / *Código de Comercio* practice
   `[Secondary, Dentons Panama tax overview]`?
4. Are recordings or photographs taken at venues (potentially containing
   attendees' faces) in scope for Law 81 Art. 4 biometric data?
   *(Current OKÜ behaviour: not knowingly captured; placeholder for
   future risk if event-photos features ship.)*
5. What is ANTAI's expected timeline for the access/portability right —
   the FAQ implies "without undue delay" but does not state hours/days
   `[Official, ANTAI FAQ §V]`.

These should be moved out of "open" status before paid launch.
