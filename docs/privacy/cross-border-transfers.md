# Cross-Border Transfers — Vendor Map

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

## 1. Legal framing

Law 81 Art. 33–35 permits cross-border transfer of personal data when at
least one of the following is true `[Official]`:

1. The recipient country offers an **adequate** level of protection (as
   determined by ANTAI; no public adequacy list has been issued
   `[Secondary, DLA Piper Panama]`).
2. Standard contractual clauses or binding corporate rules are in place
   between controller and recipient `[Official]`.
3. The data subject has given informed consent to the specific transfer
   `[Official]`.
4. The transfer is necessary for the performance of a contract with the
   data subject, or for pre-contractual measures at the subject's
   request `[Official]`.
5. The transfer is necessary to protect a vital interest, to comply with
   a legal obligation, or for reasons of substantial public interest
   `[Official]`.

In practice, most OKÜ vendor transfers will rely on basis 4 (contract
performance) or basis 2 (the vendor's published DPA + standard clauses),
with the *fact* of the transfer disclosed in the privacy notice
`[Secondary, DLA Piper Panama]`.

A signed Data Processing Agreement is a precondition for relying on
basis 2. **No DPAs are on file today** — closing this gap is sequenced
in roadmap §A.

---

## 2. Vendor inventory

> Region codes: **PA** Panama; **US** United States; **EU** European
> Economic Area; **GLOBAL** vendor with multi-region replication.

### 2.1 Replit (compute, app hosting, Postgres database, object storage)

| | |
| --- | --- |
| **Vendor role** | Processor (compute + DB + object storage) `[Internal inference]` |
| **Region of processing** | US (primary). `DATABASE_URL`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR` all resolve to Replit-managed infrastructure. |
| **Data categories transferred** | Everything in `prisma/schema.prisma` — see `data-classification.md` for the full register. |
| **Lawful basis for transfer** | Performance of contract (the platform itself) `[Official, Art. 5 + Art. 33]`; standard contractual clauses via Replit's published DPA once executed. |
| **Disclosed in notice?** | **Target** — must be added before launch. |
| **DPA status** | **Target** — must be executed. |
| **Sub-processors** | Replit's underlying cloud (currently US-region GCP-class infra, per Replit docs). Treat as transitive. |
| **riskFlag (1=low / 2=medium / 3=high)** | **3** — covers all categories — primary controller for everything in `prisma/schema.prisma` |
| **Data subject impact if breached** | Highest — covers all categories. |

### 2.2 Resend (transactional email + newsletter)

| | |
| --- | --- |
| **Vendor role** | Processor `[Internal inference]` |
| **Region** | US |
| **Data categories** | Recipient `email`, `name` (display only), email subject + body. Email body may contain order numbers, ticket codes, beneficiary status names. **For HOLD/REJECT transitions** (`HOLD_OR_REJECT` bucket in `src/server/beneficiaries/statusEmail.ts`) the email also includes the free-text `reason` provided by the admin — this can carry incidental PII or compliance context. **Never** bank account numbers, document files, account `last4`, or other `RESTRICTED_COMPLIANCE` rows. |
| **Lawful basis** | Consent (newsletter) `[Official]`; performance of contract (transactional receipts, status notices) `[Official]`. |
| **Disclosed in notice?** | **Target.** |
| **DPA status** | Resend publishes a DPA — **target** to execute and store. |
| **Sub-processors** | AWS SES (per Resend public docs) — US. |
| **riskFlag (1=low / 2=medium / 3=high)** | **2** — email payload can correlate identity with OKÜ membership and event attendance; HOLD/REJECT bodies carry free-text reason |
| **Data subject impact if breached** | Medium — emails can correlate identity to OKÜ membership and event attendance. |

### 2.3 Cybersource (Visa) — card processing

| | |
| --- | --- |
| **Vendor role** | Independent controller for fraud + AML purposes; processor for the act of taking the charge `[Internal inference, mirrors PCI standard practice]`. |
| **Region** | US (`api.cybersource.com` / `apitest.cybersource.com`). |
| **Data categories** | Card PAN + CVV (tokenised in-browser by Cybersource Microform — production path, never touches OKÜ servers); cardholder name; billing address (if collected); transaction amount; merchant order reference (`Payment.id`). **Sandbox-only caveat `[Internal inference]`:** `src/app/api/v1/checkout/confirm/route.ts` currently accepts a raw `cybersourceCard` body for the sandbox/test environment — production must reject this path; the launch-readiness checks should assert that raw-card acceptance is disabled when `environment === "production"`. |
| **Lawful basis** | Performance of contract (the purchase) `[Official]`; legal obligation (PCI DSS, AML) `[Official + Internal inference]`. |
| **Disclosed in notice?** | **Target** — must include the one-line transfer disclosure on the checkout payment step. |
| **DPA status** | Visa publishes DPA + SCC bundle — **target** to execute. |
| **Sub-processors** | Visa global network. |
| **riskFlag (1=low / 2=medium / 3=high)** | **2** — card data tokenised in browser — high at network level (out of OKÜ control), low for OKÜ-stored data |
| **Data subject impact if breached** | High at the network level (out of OKÜ's hands); low for OKÜ-stored data because we never see raw PAN/CVV. |

### 2.4 Authorize.net — card processing (legacy / inactive in Panama tenant)

| | |
| --- | --- |
| **Vendor role** | Processor for any historical Authorize.net charges. |
| **Region** | US. |
| **Data categories** | Same shape as Cybersource — for OKÜ Panama, **inactive** (Cybersource is the active checkout gateway per Payments P5a). Refunds/voids on historical Authorize.net rows continue to route by `Payment.provider` and therefore continue to transfer to Authorize.net. |
| **Lawful basis** | Performance of contract (refund obligation on the original purchase) `[Official]`. |
| **Disclosed in notice?** | **Target** — flag historical rows in the disclosure ("If your original purchase used Authorize.net, refunds settle through Authorize.net"). |
| **DPA status** | **Target.** |
| **riskFlag (1=low / 2=medium / 3=high)** | **2** — same shape as Cybersource; legacy/inactive in Panama tenant — still in scope for refunds on historical orders |
| **Data subject impact if breached** | Same as Cybersource. |

### 2.5 Banesco — bulk payouts to beneficiaries (out of scope for Payments P5 runtime; settings-only today)

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

| | |
| --- | --- |
| **Vendor role** | Independent controller (Banesco runs their own KYC/AML on the beneficiary). |
| **Region** | PA (domestic — no cross-border transfer for the payout file itself). |
| **Data categories** | Beneficiary `accountHolderName`, `bankName`, `accountNumber` (decrypted at file-build time, never logged), `accountType`, `currency`, `swiftBic`, identifier fields per Banesco's spec, plus payout amount + reference. Document files (proof-of-address, ID, tax/RUC, source-of-funds) flow to Banesco only when they request — **pending the verbatim Banesco caveat above**. |
| **Lawful basis** | Performance of contract (the influencer/partner agreement) + legal obligation (Banesco's KYC requirements imposed on us as their customer) `[Official + Internal inference]`. |
| **Disclosed in notice?** | **Target** — disclose Banesco as the payout bank; clarify that Banesco performs the formal KYC/AML, not OKÜ. |
| **DPA status** | Domestic PA-PA; the underlying customer agreement governs. |
| **riskFlag (1=low / 2=medium / 3=high)** | **3** — bank coordinates + identification document files; mitigated by AES-256-GCM and private-bucket ACL |
| **Data subject impact if breached** | High — bank coordinates + document files. Mitigated by AES-256-GCM at rest and private-bucket-ACL on documents. |

### 2.6 INVU — POS (Panama-domestic)

| | |
| --- | --- |
| **Vendor role** | Processor (table-binding correlation, attribution observer). |
| **Region** | PA (domestic). |
| **Data categories** | Reservation party size, table assignment, INVU table session id. Identity is correlated by binding, not by sending guest PII to INVU. |
| **Lawful basis** | Performance of contract (the reservation) `[Official]`. |
| **Disclosed in notice?** | **Target.** |
| **DPA status** | Domestic — assess under Panama law only. |
| **riskFlag (1=low / 2=medium / 3=high)** | **1** — table-binding metadata only; no direct guest PII transferred to INVU |
| **Data subject impact if breached** | Low — table metadata is not directly identifying. |

### 2.7 Replit-managed object storage (private bucket — beneficiary documents)

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

| | |
| --- | --- |
| **Vendor role** | Processor (storage). |
| **Region** | US (managed by Replit). |
| **Data categories** | `BeneficiaryDocument` files: proof-of-address, ID/passport, tax/RUC, source-of-funds. |
| **Lawful basis** | Performance of contract + legal obligation (Banesco's KYC) `[Official + Internal inference]`. |
| **Disclosed in notice?** | **Target.** |
| **DPA status** | Inherits Replit DPA (§2.1). |
| **Sub-processors** | Same as Replit. |
| **riskFlag (1=low / 2=medium / 3=high)** | **3** — raw RESTRICTED_COMPLIANCE document files (proof-of-address, ID, tax/RUC, source-of-funds) |
| **Data subject impact if breached** | Highest after raw bank credentials. Mitigated by private-bucket ACL + 90-day-post-`BANK_READY` purge (target). |

### 2.8 Sentry (error capture) — *if* `SENTRY_DSN` is set

| | |
| --- | --- |
| **Vendor role** | Processor. |
| **Region** | US (default Sentry SaaS). |
| **Data categories** | Error stack traces, request URL, sanitised request payload (PII fields scrubbed by capture rules), server environment metadata, `RELEASE_SHA`. **Never** bank account numbers, document files, raw audit metadata — engineering convention is to scrub these at capture. |
| **Lawful basis** | Legitimate interest (security + reliability) `[Official]`. |
| **Disclosed in notice?** | **Target** — only if `SENTRY_DSN` is enabled in production. |
| **DPA status** | Sentry publishes DPA + SCCs — **target** to execute and store. |
| **Sub-processors** | AWS US per Sentry public docs. |
| **riskFlag (1=low / 2=medium / 3=high)** | **1** — stack traces only, scrubbed at capture; medium → 2 if a regression sends raw payload bodies |
| **Data subject impact if breached** | Low if scrubbing is enforced; medium if a regression sends raw payload bodies. |

### 2.9 Google / Facebook social login — *if* enabled

| | |
| --- | --- |
| **Vendor role** | Independent controller (the IdP). |
| **Region** | US / GLOBAL. |
| **Data categories** | OAuth claims: `email`, `name`, `picture`. We do not request scopes beyond profile + email. |
| **Lawful basis** | Consent (the user clicks "Sign in with Google/Facebook") `[Official]`. |
| **Disclosed in notice?** | **Target.** |
| **DPA status** | Public IdP terms — no per-tenant DPA needed; user-consent basis. |
| **riskFlag (1=low / 2=medium / 3=high)** | **1** — OAuth profile claims only (email, name, picture); no incremental PII beyond what we'd otherwise ask |
| **Data subject impact if breached** | Low (no incremental PII beyond what we'd ask anyway). |

### 2.10 Cloudmersive Advanced AV (virus scan of beneficiary uploads) — *if* `CLOUDMERSIVE_AV_API_KEY` is set

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

| | |
| --- | --- |
| **Vendor role** | Processor (file scanning). |
| **Region** | US. |
| **Data categories** | The full beneficiary document file is uploaded to the scan endpoint. **High-sensitivity transfer.** |
| **Lawful basis** | Legitimate interest (security — prevent malware on platform) `[Official, Internal inference]`. |
| **Disclosed in notice?** | **Target** — explicitly named in the privacy notice. |
| **DPA status** | Cloudmersive publishes a DPA — **target** to execute. Also confirm "no-retention / no-training" mode is enabled by contract. |
| **Sub-processors** | Per Cloudmersive public docs. |
| **riskFlag (1=low / 2=medium / 3=high)** | **3** — full beneficiary document file uploaded for scanning; same shape as a document leak |
| **Data subject impact if breached** | High — same shape as a beneficiary document leak. |

### 2.11 Self-hosted AV shim (`AV_SCAN_URL`) — fallback when Cloudmersive unset

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML. (Same data shape as §2.10 — beneficiary document files.)

| | |
| --- | --- |
| **Vendor role** | Self-hosted (own infra). |
| **Region** | TBD on hosting. |
| **Data categories** | Same as Cloudmersive. |
| **Lawful basis** | Same. |
| **Disclosed in notice?** | Internal-only deployment; if launched, document the host region. |
| **riskFlag (1=low / 2=medium / 3=high)** | **3** — same as Cloudmersive; actual risk depends on chosen self-host region. |

### 2.12 NextAuth Google / Facebook OAuth — see §2.9

(no second entry)

### 2.13 Future AI vendor (none integrated today)

| | |
| --- | --- |
| **Vendor role** | Processor — must be contracted in **no-retention / no-training** mode. |
| **Region** | US (most likely). |
| **Data categories** | Subject to the AI data-handling rule (roadmap phase (i)): NEVER any `RESTRICTED_COMPLIANCE` field; ALLOWED_WITH_REDACTION for INTERNAL fields after the documented redaction step. |
| **Lawful basis** | Legitimate interest (service quality) + opt-out (data subject) `[Internal inference]`. |
| **Disclosed in notice?** | Required before any AI feature ships. |
| **DPA status** | Required before any AI feature ships. |
| **Status** | **Follow-up — gated by roadmap phase (i).** |
| **riskFlag (1=low / 2=medium / 3=high)** | **3** — TBD; default to worst-case until vendor selected, contracted no-retention/no-training, and added to register. |

---

## 3. Transfer-mechanism summary

| Vendor | Region | Primary lawful basis | DPA needed? | Disclosed? |
| --- | --- | --- | --- | --- |
| Replit (compute, DB, storage) | US | Contract perf. | ✅ target | ✅ target |
| Resend | US | Consent + contract perf. | ✅ target | ✅ target |
| Cybersource (Visa) | US | Contract perf. + legal obligation | ✅ target | ✅ target |
| Authorize.net (legacy refunds) | US | Contract perf. | ✅ target | ✅ target |
| Banesco | PA (domestic) | Contract perf. + legal obligation | n/a — PA-PA | ✅ target |
| INVU | PA (domestic) | Contract perf. | n/a — PA-PA | ✅ target |
| Sentry (if enabled) | US | Legitimate interest | ✅ target | ✅ target |
| Google / Facebook OAuth | US/GLOBAL | Consent | n/a — IdP terms | ✅ target |
| Cloudmersive AV (if enabled) | US | Legitimate interest | ✅ target | ✅ target |
| Future AI vendor | US (TBD) | Legitimate interest + opt-out | required pre-launch | required pre-launch |

---

## 4. Privacy-notice copy block (EN — for the notice page)

> *Where your data is processed.* OKÜ Panama operates from Panama City.
> To run the platform we use a small set of trusted vendors that may
> process your data outside Panama, primarily in the United States:
> Replit (compute and database hosting), Resend (transactional email),
> Visa Cybersource (secure card processing — your card details are
> tokenised in your browser and never touch our servers), and, where
> enabled, Sentry (error reporting) and Cloudmersive (virus scanning of
> uploaded documents). For payouts we transfer beneficiary information
> to Banesco in Panama; Banesco performs the formal KYC/AML compliance
> review when they onboard you. Each transfer relies on the performance
> of our contract with you, on the vendor's standard contractual
> clauses, or on your consent — disclosed individually in the relevant
> form. You can ask the OKÜ Data Protection Officer for the full vendor
> register at any time.

(ES + PT translations to be produced as part of roadmap §C.)

---

## 5. Engineering checklist before paid launch

- [ ] Execute and store DPAs for: Replit, Resend, Cybersource, Sentry
      (if enabled), Cloudmersive (if enabled).
- [ ] Confirm Cloudmersive contract enables no-retention / no-training
      mode for uploads.
- [ ] Privacy notice published at `/[locale]/privacy` listing every
      vendor in §2.
- [ ] One-line transfer disclosure added to the checkout payment step.
- [ ] One-line "what we do with this" panel added to `/my/beneficiary`.
- [ ] Footer link to privacy notice on every public page.
- [ ] Banesco verbatim caveat acknowledged in any document/spec that
      describes the payout file format.
