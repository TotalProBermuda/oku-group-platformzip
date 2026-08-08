# Lawful-Basis Matrix — Per-Purpose Register

> **This is an engineering privacy audit, not legal advice.** Final
> interpretation, retention periods, consent wording, and cross-border
> transfer language must be reviewed by Panama counsel.

> **Source-tag legend.** `[Official]` = Law 81 / Decree 285 text **and**
> ANTAI (Panama government regulator) guidance / FAQs. `[Secondary]` =
> law-firm summaries (DLA Piper, Dentons, etc.). `[Internal inference]`
> = engineering interpretation pending counsel review.

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.
> when they onboard the beneficiary. Our beneficiary verification is a
> bank-readiness workflow, not a regulated KYC determination.

> **Banesco verbatim caveat.** *"Banesco bulk-payment export may introduce
> additional required fields. Any new field required by Banesco must be
> classified before implementation and must not be added directly to
> exports without privacy review."*

---

## How to read this table

For each processing **purpose** (a "why we touch this data" — not a
feature) we record:

| Column | Meaning |
| --- | --- |
| **Purpose** | Specific business reason. |
| **Data categories** | Field-level reference into `data-classification.md`. |
| **Lawful basis** | Law 81 Art. 5 basis we rely on. |
| **Consent surface (if any)** | The exact UI surface where consent is captured (or "n/a — non-consent basis"). |
| **Retention (target)** | Maximum time we keep the data for this purpose. |
| **Shared with** | External processors / controllers — see `cross-border-transfers.md` for the full vendor map. |
| **Status** | `Current` (already implemented) / `Target` (must ship before launch) / `Follow-up`. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

States below describe the **target** posture; gaps from current are
called out in the Status column.

---

## 1. Account creation and authentication

| | |
| --- | --- |
| **Purpose** | Identify the user, authenticate them, and grant role-based access to portals. |
| **Data categories** | `User.email`, `User.name`, `User.phone` *(optional)*, `User.imageUrl`, `UserRole.roleKey`, NextAuth session cookie. |
| **Lawful basis** | Performance of contract (Terms of Service) `[Official, Art. 5]`. |
| **Consent surface** | n/a — non-consent basis. ToS link presented at signup `[Internal inference — must be added to login page before launch]`. |
| **Retention (target)** | While account is active + 24 months after last login; then anonymise (`email` → tombstone hash, `name` / `phone` → null). `[Internal inference]` |
| **Shared with** | Replit (compute + DB hosting), optionally Google or Facebook (if user signs in via social — minimal claims only: email, name, picture). |
| **Status** | **Current**: collected. **Target**: privacy notice link at login + signup; absolute 8-hour session timeout for admin/finance roles. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 2. Marketing and newsletter communications

| | |
| --- | --- |
| **Purpose** | Send promotional content, event announcements, member updates. |
| **Data categories** | `User.email`, `NewsletterSubscription.email`, `UserProfile.marketingOptIn`, `UserProfile.preferredVenue`, `UserProfile.language`. |
| **Lawful basis** | Consent `[Official, Art. 5]`. |
| **Consent surface** | (a) Newsletter signup widget (footer + standalone page) — explicit checkbox or "Subscribe" button as affirmative act. (b) `/account` marketing toggle (default off). |
| **Retention (target)** | Until consent withdrawn. After withdrawal: keep an entry in a *suppression list* (hash of email) so we don't re-mail by accident; the source row is anonymised. `[Internal inference]` |
| **Shared with** | Resend (email delivery, US-hosted). |
| **Status** | **Current** for collection and opt-out. **Target**: add ES privacy notice link beside the newsletter checkbox. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 3. Order, ticket and membership purchase

| | |
| --- | --- |
| **Purpose** | Complete a paid transaction (Tickets, Experiences, Events, Memberships). |
| **Data categories** | `User.email`, `User.name`, `Order.*` (no card data), `OrderLineItem.*`, `Ticket.code`, `Payment.gatewayTransactionId`, `Payment.gatewayResponseCode`. Card PAN / CVV are tokenised in-browser by Cybersource Microform — they never touch our server. |
| **Lawful basis** | Performance of contract `[Official, Art. 5]`. |
| **Consent surface** | n/a for the transaction itself. **Target**: a one-line cross-border-transfer disclosure at the payment step ("Card details are tokenised by Visa Cybersource (United States); see our privacy notice"). |
| **Retention (target)** | 7 years for fiscal/commercial record-keeping `[Secondary, Dentons Panama tax overview — to be confirmed by counsel]`. |
| **Shared with** | Cybersource / Visa (US — card processing); Resend (email receipts); Banesco (only when funds settle to OKÜ — Banesco does not see attendee identity). |
| **Status** | **Current** for the data. **Target**: payment-step disclosure copy (see roadmap §C). |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 4. Refunds and order disputes

| | |
| --- | --- |
| **Purpose** | Reverse a charge, void an authorisation, or settle a chargeback. |
| **Data categories** | `Payment.gatewayTransactionId`, `Payment.gatewayReferenceId`, `Payment.amountCents`, `Order.userId`, admin actor identity, `AuditLog` records. |
| **Lawful basis** | Performance of contract + legal obligation (consumer-protection refund obligations) `[Official, Art. 5]`. |
| **Consent surface** | n/a. |
| **Retention (target)** | Same 7 years as the underlying order. |
| **Shared with** | The original payment provider on `Payment.provider` — **never** the currently-active gateway (load-bearing rule, see `replit.md` Gotchas). |
| **Status** | **Current**. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 5. Beneficiary bank-readiness and payout

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

| | |
| --- | --- |
| **Purpose** | Assemble structured information so Banesco can run their own KYC/AML and so OKÜ Finance can prepare the bulk-payout file. |
| **Data categories** | `BeneficiaryProfile.banescoAccountNumberEncrypted` (AES-256-GCM, last4 only displayed), `bankName`, `accountHolderName`, `accountType`, `currency`, `swiftBic`, document-status flags, `BeneficiaryDocument` files in private object storage (proof-of-address, ID, tax/RUC, source-of-funds), `complianceHoldReason`, `adminVerificationNotes`. |
| **Lawful basis** | Performance of contract (the influencer/partner agreement requires we pay you) + legal obligation (Banesco's KYC requirements imposed on us as their customer) `[Official, Art. 5; Internal inference for the legal-obligation prong]`. |
| **Consent surface** | n/a — non-consent basis. **Target**: a clear "what we do with this" panel on `/my/beneficiary` plus a link to the privacy notice. |
| **Retention (target)** | Bank coordinates: while account active + 24 months after last successful payout, then deleted. Document files in object storage: purged 90 days after `BANK_READY` is achieved, since Banesco then becomes the system of record. *Pending Banesco's written confirmation per the verbatim caveat above.* |
| **Shared with** | Banesco (independent controller for their KYC); Replit-managed object storage (private bucket). The encrypted account number is never sent unencrypted in any export. |
| **Status** | **Current** for collection, encryption, audit. **Target**: privacy panel on `/my/beneficiary`, retention worker, rate-limit on `PATCH /api/v1/me/beneficiary`. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 6. Hiring and applications

| | |
| --- | --- |
| **Purpose** | Receive and evaluate candidates for OKÜ open roles. |
| **Data categories** | `JobApplication.name`, `email`, `phone`, `resumeUrl`, `notes`. Plus `ApplicationSubmission.submissionDataJson` for richer template-driven flows. |
| **Lawful basis** | Steps prior to entering a contract at the data subject's request (pre-contract) `[Official, Art. 5]` + consent for any voluntarily-disclosed sensitive data on the résumé. |
| **Consent surface** | `data_consent` widget rendered by `src/components/hiring/DynamicField.tsx` — affirmative checkbox per consent text. ✅ Currently captured. |
| **Retention (target)** | 12 months from final hiring decision. Longer only if the candidate explicitly opts in to a "talent pool" flag (not yet built). |
| **Shared with** | Replit (compute + DB), object storage (résumé files). No third-party ATS. |
| **Status** | **Current** for collection + consent. **Target**: self-serve consent withdrawal route. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 7. Reservation, booking and check-in

| | |
| --- | --- |
| **Purpose** | Reserve a table or session, and check the guest in on arrival. |
| **Data categories** | `User.name`, `User.email`, `User.phone`, party size, table assignment, INVU table-binding metadata. |
| **Lawful basis** | Performance of contract (the reservation) `[Official, Art. 5]`. |
| **Consent surface** | n/a for the reservation. **Target**: privacy notice link on the reservation form. |
| **Retention (target)** | 24 months from reservation date for analytics and repeat-guest hospitality, then anonymised (party size + venue retained without subject identity). `[Internal inference]` |
| **Shared with** | INVU (POS — Panamanian vendor; treated as a domestic processor for transfer purposes — see `cross-border-transfers.md`). Reservation host (RESTAURANT_HOST role) sees full identity; STAFF_OKU sees redacted. |
| **Status** | **Current** for collection. **Target**: privacy notice link on reservation form. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 8. Influencer / Partner / Referrer attribution and payout

| | |
| --- | --- |
| **Purpose** | Track which influencer / partner / event-referrer drove a sale, compute commission, and pay it out. |
| **Data categories** | `InfluencerProfile.handle`, `displayName`, `whatsapp`, `instagramUrl`, `Attribution.refCode`, UTM params, `LedgerEntry.*`, `PayoutBatch.*`. |
| **Lawful basis** | Performance of contract (the influencer agreement) `[Official, Art. 5]` for the influencer's own data; legitimate interest (commercial attribution) for the buyer's order metadata that is linked back via `attributedInfluencerId` `[Official, Art. 5; Internal inference]`. |
| **Consent surface** | n/a for the influencer (contract). For the buyer the attribution is incidental to a transaction they chose to make. The privacy notice will disclose attribution as a purpose. |
| **Retention (target)** | Same 7-year window as the underlying orders, since attribution is what drives commission and tax records. |
| **Shared with** | Internal only; Banesco when payout actually settles. |
| **Status** | **Current**. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 9. Operational + security audit

| | |
| --- | --- |
| **Purpose** | Detect fraud, investigate incidents, and demonstrate Law 81 accountability. |
| **Data categories** | `AuditLog.actorId`, `AuditLog.action`, `AuditLog.metadata` (sanitised — never raw secrets), `AuditLog.ip`, `UserAuditLog.*`, beneficiary state-machine transitions, payment gateway change events, refund/void events, ticket comp-issue events, ticket CSV export events, role grant/revoke. |
| **Lawful basis** | Legal obligation (Law 81 Art. 5 accountability requirement) + legitimate interest (security) `[Official, Art. 5]`. |
| **Consent surface** | n/a — security/legal-obligation basis. Disclosed in the privacy notice. |
| **Retention (target)** | 24 months minimum, then archived (encrypted) for an additional 5 years. `[Internal inference]` |
| **Shared with** | Internal only. Sentry (if `SENTRY_DSN` set — error stack-traces only, sanitised by capture rules). |
| **Status** | **Current** for collection. **Target**: nightly hash-chain export + incident-response register. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |

---

## 10. Customer support and AI-assisted summarisation *(forward-looking — no AI feature shipped today)*

| | |
| --- | --- |
| **Purpose** | If/when we add AI-assisted summarisation of support chats, host notes, or beneficiary communications — covered here pre-emptively so no engineer ships it without a basis. |
| **Data categories** | Free-text chat / notes only. Bank coordinates, document files, and `RESTRICTED_COMPLIANCE` rows are **never** sent to an AI vendor (see roadmap §I — AI data-handling rule). |
| **Lawful basis** | Legitimate interest (service quality) `[Internal inference]` with a documented balancing test, AND data-subject opt-out via account preferences. |
| **Consent surface** | (To be built.) An opt-out toggle on `/account`, plus a one-time disclosure modal on first interaction with an AI-assisted feature. |
| **Retention (target)** | AI-vendor calls must use a *no-retention* mode (e.g. OpenAI zero-retention, Anthropic no-train). Internal storage of the summary follows the parent record's retention. |
| **Shared with** | TBD — must appear in `cross-border-transfers.md` before any AI feature ships. |
| **Status** | **Follow-up** — sequenced as roadmap §I. |
| **Current state** | Whatever the table above describes that is *true today in the running code* (Lawful basis + Data + Retention rows). |
| **Target state** | Whatever the table above marks **Target** (Disclosure, DPA, retention windows pending counsel sign-off). |
| **Follow-up** | Tracked in `compliance-roadmap.md` — the phase letter referenced in the corresponding section of `panama-law-81-audit.md`. |
