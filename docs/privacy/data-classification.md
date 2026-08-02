# Data Classification — Field-Level Register

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

## Tier definitions

| Tier | Meaning | Default handling |
| --- | --- | --- |
| **PUBLIC** | Intentionally published or non-personal. | No special controls. |
| **INTERNAL** | Operational data — not secret, but not for public exposure. | RBAC-gated; no encryption-at-rest required. |
| **FINANCIAL** | Transaction records, ledger entries, payout amounts, tax-relevant fields. | RBAC-gated; 7-year retention for tax; sanitised in any AI exposure. |
| **RESTRICTED_COMPLIANCE** | Bank coordinates, document evidence, internal admin notes that may contain PII, and any other field whose breach would create direct material harm to the data subject. | RBAC-gated; encrypted-at-rest where it is a single field (e.g. account number); private-bucket-only for files; **NEVER** sent to AI; surfaced as last4 / redacted where possible. |

## AI exposure verdicts

> The AI exposure column uses exactly three values: **NEVER**, **SUMMARY_ONLY**, **ALLOWED_WITH_REDACTION**. Public PUBLIC-tier content (intentionally published — handles, public bios, slugs, prices, dates, public images, public refCodes) is unconstrained and is recorded as **N/A — public** in the table.

| Verdict | Meaning |
| --- | --- |
| **NEVER** | The field MUST NOT be included in any prompt, embedding, vector index, fine-tuning corpus, or training set sent to any AI vendor. Bank coordinates, document files, encrypted credentials, raw audit metadata. |
| **SUMMARY_ONLY** | Aggregate counts or non-identifying summaries are acceptable. The raw field is not. (E.g. "12 orders this week" — yes; the order rows themselves — no.) |
| **ALLOWED_WITH_REDACTION** | The field may flow to an AI vendor only after a documented redaction step strips identifiers (email/phone/name → tokens). |

## Schema-level encryption legend

| Code | Where |
| --- | --- |
| **AES-256-GCM** | `src/server/security/encryption.ts`, key from `APP_ENCRYPTION_KEY`. Used today for: `BeneficiaryProfile.banescoAccountNumberEncrypted`, `PaymentGatewayCredential.*` Authorize.net secrets, `CybersourceGatewayCredential.*` secrets, INVU credentials. |
| **bcrypt** | n/a today (no local password storage — auth via NextAuth credentials/social). |
| **Hash-only** | `SeatInvite.tokenHash` (SHA-256 hex; raw token only ever in the email link). |
| **Object-store ACL** | Private GCS bucket; not reachable by the public media proxy. Used for `BeneficiaryDocument.objectPath`. |
| **At-rest by hosting provider** | Postgres on Replit — disk-level encryption by the cloud provider; not application-level. |

---

## Section template — Current / Target / Follow-up convention

Every model section below uses the same column contract so the same
template applies throughout — no per-section reinterpretation. The
explicit **Current / Target / Follow-up** breakdown is:

- **Current state** = the **Visibility** column + the **API surfaces
  (current → target)** block's *current* bullet for each surface. Read
  the Visibility column as "who can read this row today, in the running
  codebase".
- **Target state** = the **Target visibility by role** matrix + the
  **API surfaces (current → target)** block's *target* bullet + the
  **Target retention** column. Where a row's current matches its
  target, the matrix is omitted to keep the document scannable.
- **Follow-up** = the parenthetical roadmap-phase reference inline in
  each row (e.g. "roadmap (a)" / "(b)" / "(g)") — these point to the
  exact follow-up engineering task that closes the gap.

**Roadblock** rows in §16 are the cross-cutting drift risks that span
multiple models; they each carry their own Current/Target/Follow-up
notes inline.

## 1. `User`

**API surfaces (current → target).**
- `GET /api/v1/me` and `/account` page — RAW (self).
- Admin user editor — RAW for SUPERADMIN; `internalNotes` RAW; *target*: free-text drift hint banner (roadmap (b)).
- Search indexes / CSV exports — *current*: include `name` and `email` in admin lists; *target*: explicit deny-list keeps `internalNotes` out of any `?q=` index and CSV export (roadmap (g)).

**Target visibility.**
| Role | `email` / `name` / `phone` | `internalNotes` / `tags` / status fields |
| --- | --- | --- |
| Self | RAW (own) | HIDDEN |
| Admin (`admin:users:read`) | RAW | RAW |
| RESTAURANT_HOST (own bookings only) | RAW for guests they host | HIDDEN |
| Anyone else | HIDDEN | HIDDEN |


| Field | Tier | Encryption | Role visibility (current) | Target retention | Data-min verdict | AI exposure |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | INTERNAL | — | self + admin | account-life + 24m | MINIMAL | ALLOWED_WITH_REDACTION |
| `email` | INTERNAL | at-rest by host | self + admin + finance | anonymise to tombstone hash on retention expiry | MINIMAL | ALLOWED_WITH_REDACTION |
| `name` | INTERNAL | at-rest by host | self + admin + host (for reservations) + finance | account-life + 24m | MINIMAL | ALLOWED_WITH_REDACTION |
| `phone` | INTERNAL | at-rest by host | self + admin + host + finance | account-life + 24m | MINIMAL — keep optional | ALLOWED_WITH_REDACTION |
| `imageUrl` | PUBLIC | — | anyone with profile access | account-life | MINIMAL | N/A — public |
| `status` / `suspendedAt` / `suspensionReason` / `lockedAt` / `lockReason` | INTERNAL | — | admin only | 24m after account closure | MINIMAL | NEVER (operational only) |
| `internalNotes` | INTERNAL → **RISK** of drift to RESTRICTED | at-rest by host | admin only | 24m | **RISK: free-text, no schema; admins may paste sensitive data here.** Recommend admin-UI hint. | NEVER |
| `tags` | INTERNAL | — | admin only | account-life | MINIMAL | SUMMARY_ONLY |
| `lastLoginAt` / `forcedLogoutAt` | INTERNAL | — | admin only | 24m | MINIMAL | NEVER |
| `createdAt` / `updatedAt` | INTERNAL | — | self + admin | account-life | MINIMAL | ALLOWED_WITH_REDACTION |

## 2. `UserProfile`

| Field | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `language` | PUBLIC | self + admin | account-life | MINIMAL | N/A — public |
| `preferredVenue` | INTERNAL | self + admin | account-life | MINIMAL | ALLOWED_WITH_REDACTION |
| `marketingOptIn` | INTERNAL | self + admin | until withdrawn | MINIMAL | NEVER |

## 3. `InfluencerProfile`

| Field | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `handle`, `displayName`, `headline`, `shortBio`, `longBio`, `profileImageUrl`, `coverImageUrl`, `instagramUrl`, `tiktokUrl`, `youtubeUrl`, `websiteUrl`, `location` | PUBLIC (when `isPublic=true`) | anyone | account-life | MINIMAL | N/A — public |
| `whatsapp` | INTERNAL | self + admin + finance | account-life | MINIMAL — used for payout coord. | NEVER |
| `preferredLanguage` | PUBLIC | anyone | account-life | MINIMAL | N/A — public |
| `refCode` | PUBLIC (intentionally — drives `/r/[code]`) | anyone | account-life | MINIMAL | N/A — public |
| `commissionRateBps`, `payoutCycle`, `minPayoutThresholdCents` | FINANCIAL | self + admin + finance | account-life + 7y | MINIMAL | NEVER |
| `approved`, `approvalStatus`, `isVerified` | INTERNAL | self + admin | account-life | MINIMAL | ALLOWED_WITH_REDACTION |

## 4. `PartnerProfile`, `InvestorProfile`, `StaffProfile`

### 4a. `PartnerProfile`

| Field | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `name` (organisation name — but sole-proprietor partners exist, so treat as PII) | INTERNAL | self + admin + finance | account-life + 24m | MINIMAL | ALLOWED_WITH_REDACTION |
| `displayName`, `slug`, `logoUrl`, `coverImageUrl`, `shortBio`, `longBio`, `website`, `instagramUrl`, `location` | PUBLIC (when `isPublic=true`) | anyone | account-life | MINIMAL | N/A — public |
| `contactEmail`, `contactPhone` | INTERNAL | self + admin | account-life + 24m | MINIMAL | NEVER |
| `commissionRateBps`, `payoutCycle`, `minPayoutThresholdCents` | FINANCIAL | self + admin + finance | account-life + 7y | MINIMAL | NEVER |
| `approved`, `approvalStatus` | INTERNAL | self + admin | account-life | MINIMAL | NEVER (operational) |
| `internalNotes` (if present on row) | INTERNAL → RISK of free-text drift | admin only | 24m | RISK | NEVER |

### 4b. `InvestorProfile`

| Field | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `displayName`, `firmName`, `bioPublic`, `linkedInUrl`, `websiteUrl`, `headshotUrl` | PUBLIC (when `isPublic=true`) | anyone | account-life | MINIMAL | N/A — public |
| `contactEmail`, `contactPhone` | INTERNAL | self + admin (IR) | account-life + 24m | MINIMAL | NEVER |
| `accreditationStatus`, `kycStatus` (IR-side, not banking-side) | INTERNAL | self + admin (IR) | account-life + 24m | MINIMAL | NEVER |
| `internalNotes` | INTERNAL → RISK of free-text drift | admin (IR) only | 24m | RISK | NEVER |

### 4c. `StaffProfile`

| Field | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `displayName`, `position`, `headshotUrl`, `bio` | PUBLIC (when surfaced on team pages) | anyone (when public) | employment + 12m | MINIMAL | N/A — public |
| `employeeId`, `departmentCode`, `managerUserId` | INTERNAL | self + admin (HR) | employment + 12m | MINIMAL | NEVER |
| `internalNotes` | INTERNAL → RISK of free-text drift | admin (HR) only | employment + 12m | RISK | NEVER |

## 5. `BeneficiaryProfile` — **RESTRICTED_COMPLIANCE block**

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

**API surfaces (current → target).**
- `GET /api/v1/me/beneficiary` — *current*: returns `toView()` including `adminVerificationNotes` and document statuses (over-broad — flagged); *target*: `toSelfView()` returning bank fields (raw to self only) + readiness status; `adminVerificationNotes` HIDDEN; document statuses VISIBLE.
- `PATCH /api/v1/me/beneficiary` — *current*: write-through for bank fields + `statusEmailOptOut`; no rate limit; *target*: same + 5/min rate limit (roadmap (g)).
- `GET /api/v1/admin/payouts/beneficiaries` — *current*: list view, ADMIN_FINANCE/SUPERADMIN only; account number HIDDEN, `last4` MASKED display proxy; *target*: unchanged.
- `GET /api/v1/admin/payouts/beneficiaries/[userId]` — *current*: `toView()` for ADMIN_FINANCE/SUPERADMIN, all fields RAW except `banescoAccountNumberEncrypted` (HIDDEN); *target*: split — `toAdminView()` (RAW for ADMIN_FINANCE/SUPERADMIN), `toSummaryView()` (display name + readiness status only) for ADMIN_COMMERCIAL via new `admin:beneficiaries:summary` permission (roadmap (b)).
- `POST /api/v1/admin/payouts/beneficiaries/[userId]/transition` — *current*: ADMIN_FINANCE/SUPERADMIN; transition reason persisted to `complianceHoldReason` (RAW) and emailed for HOLD/REJECT; *target*: unchanged + log-scrubbing guardrail asserts `reason` does not match RESTRICTED patterns (roadmap (a)).

**Target visibility by role.**
| Role | Bank fields (number) | Bank fields (name/holder/type/SWIFT/last4) | Document statuses | `adminVerificationNotes` | `complianceHoldReason` |
| --- | --- | --- | --- | --- | --- |
| Self (data subject) | RAW (write only — never returned) | RAW | VISIBLE | **HIDDEN (target — currently visible)** | VISIBLE |
| ADMIN_COMMERCIAL | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN |
| ADMIN_COMMERCIAL + `admin:beneficiaries:summary` (target) | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN; readiness status only |
| ADMIN_FINANCE | HIDDEN (decrypt only at payout-file build) | RAW | RAW | RAW | RAW |
| SUPERADMIN | HIDDEN (decrypt only at payout-file build) | RAW | RAW | RAW | RAW |
| Anyone else | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN |


| Field | Tier | Encryption | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- | --- |
| `banescoAccountNumberEncrypted` | RESTRICTED_COMPLIANCE | **AES-256-GCM** | nobody (decrypt happens only in the payout-file builder, which writes to a private export — never to UI) | active + 24m after last payout | MINIMAL | **NEVER** |
| `banescoAccountLast4` | RESTRICTED_COMPLIANCE | — (already redacted) | self + admin + finance | as above | MINIMAL — display proxy | NEVER |
| `bankName`, `accountHolderName`, `accountType`, `currency`, `swiftBic` | RESTRICTED_COMPLIANCE | at-rest by host | self + admin + finance | as above | MINIMAL — required by Banesco file (pending Banesco verbatim caveat) | NEVER |
| `proofOfAddressStatus`, `identificationStatus`, `taxOrRucStatus`, `sourceOfFundsStatus` | INTERNAL | — | **self (read-only via `GET /api/v1/me/beneficiary` → `getOwnProfile()` → `toView()`)** + admin + finance | active + 24m | MINIMAL | NEVER |
| `incomeCertificationRequired` / `incomeCertificationExpiresAt` | INTERNAL | — | self (read-only) + admin + finance | active + 24m | MINIMAL | NEVER |
| `bankReadinessStatus`, `complianceHoldReason` | INTERNAL | — | self (read-only) + admin + finance | active + 24m | MINIMAL | NEVER for `complianceHoldReason` (free-text — also flows into HOLD/REJECT status emails per `src/server/beneficiaries/statusEmail.ts`); SUMMARY_ONLY for state |
| `adminVerificationNotes` | RESTRICTED_COMPLIANCE | at-rest by host | **self (read-only via `getOwnProfile() → toView()`)** + admin + finance — `[Internal inference: this is broader than the spirit of the field name suggests; roadmap phase (b) calls for narrowing self-view to operational status only]` | active + 24m | RISK — free-text + over-broad self-visibility. Recommend admin-UI hint AND view-narrowing in `toView()`. | NEVER |
| `okuApprovedAt` / `okuApprovedById` / `bankReadyAt` / `bankReadyById` | INTERNAL | — | admin + finance | active + 24m | MINIMAL | NEVER |
| `statusEmailOptOut` | INTERNAL | — | self + admin | active | MINIMAL | NEVER |

## 6. `BeneficiaryDocument` — **RESTRICTED_COMPLIANCE block**

> **Bank vs. KYC.** OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.

**API surfaces (current → target).**
- File bytes — *current*: served only via signed URL from private bucket, generated by `beneficiaryDocumentService.ts`; *target*: + `AuditLog beneficiary.document.read` on every signed URL issued (roadmap (a)).
- Metadata listing — *current*: returned to self for own uploads + admin/finance for any; *target*: unchanged.
- Public media proxy — HIDDEN (objects under `/private/beneficiary-docs/...` are explicitly not reachable).

**Target visibility by role.**
| Role | File bytes | Filename / size / type | `scanStatus` / `scanMessage` | Soft-delete metadata |
| --- | --- | --- | --- | --- |
| Self (uploader) | RAW (own only) | RAW (own only) | RAW (own only) | RAW (own only) |
| ADMIN_FINANCE / SUPERADMIN | RAW | RAW | RAW | RAW |
| Anyone else | HIDDEN | HIDDEN | HIDDEN | HIDDEN |


| Field | Tier | Encryption | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- | --- |
| `objectPath` (file in private bucket) | RESTRICTED_COMPLIANCE | object-store ACL (private) + at-rest by host | self (own uploads only) + admin + finance | purge **90 days after `BANK_READY`** *(pending Banesco caveat)* | MINIMAL — Banesco evidence | NEVER (raw file) / SUMMARY_ONLY for "doc count" |
| `filename`, `contentType`, `sizeBytes` | INTERNAL | — | as above | as above | MINIMAL | ALLOWED_WITH_REDACTION |
| `scanStatus`, `scanMessage` | INTERNAL | — | as above | as above | MINIMAL | NEVER (`scanMessage` may carry vendor strings) |
| `uploadedById`, `uploadedAt`, `deletedAt` | INTERNAL | — | as above | as above | MINIMAL | NEVER |

## 7. `Order`, `OrderLineItem`, `OrderEvent`, `OrderNote`

**API surfaces (current → target).**
- `GET /api/v1/me/orders` — RAW (self, own orders).
- Admin order drawer + `/admin/orders` — RAW for ADMIN_COMMERCIAL/SUPERADMIN; `OrderNote.body` RAW; *target*: free-text drift hint on `OrderNote.body` (roadmap (b)).
- CSV export — *target*: explicit allow-list excludes free-text fields (roadmap (g)).

**Target visibility.**
| Role | Order metadata | `userId` link | `OrderNote.body` |
| --- | --- | --- | --- |
| Self | RAW (own) | own | HIDDEN |
| ADMIN_COMMERCIAL / SUPERADMIN | RAW | RAW | RAW |
| ADMIN_FINANCE | RAW (financial fields) | RAW | RAW |
| Anyone else | HIDDEN | HIDDEN | HIDDEN |


| Field | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `id`, `orderNumber`, `status`, `orderType`, `channel`, currency, `subtotal/fees/tax/total/discount/commission/netRevenue Cents`, `coversCount`, `couponCode`, attribution fields, timestamps | FINANCIAL | self + admin + finance | **7y** | MINIMAL | SUMMARY_ONLY |
| `userId` | INTERNAL → links to PII | as above | 7y | MINIMAL | ALLOWED_WITH_REDACTION |
| `OrderNote.body` (admin notes on orders) | RESTRICTED_COMPLIANCE if free-text | admin + finance only | 7y | RISK — free-text | NEVER |

## 8. `Payment`

| Field | Tier | Encryption | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- | --- |
| `provider`, `status`, `amountCents`, `currency`, timestamps | FINANCIAL | — | self + admin + finance | 7y | MINIMAL | SUMMARY_ONLY |
| `authNetTransId`, `authNetRefId`, `gatewayTransactionId`, `gatewayReferenceId`, `gatewayAuthCode`, `gatewayResponseCode` | FINANCIAL | — | admin + finance | 7y | MINIMAL — required to action refunds | NEVER |
| `gatewayRawSafeJson` | FINANCIAL | — | admin + finance | 7y | MINIMAL — already sanitised at write time | NEVER |
| Card PAN / CVV | n/a — never stored | tokenised in browser by Cybersource Microform | n/a | n/a | n/a | n/a |

## 8b. `Payment` — API surfaces & target visibility

**API surfaces (current → target).**
- `GET /api/v1/admin/payments/refundable-orders` — `last4`/MASKED gateway IDs surfaced; full IDs RAW for refund/void actions; *target*: + `AuditLog payment.gateway.credential.read` on any decrypt operation (roadmap (a)).
- Customer-facing receipt — `last4` MASKED + amount + currency only.

**Target visibility.**
| Role | `provider` / `status` / `amount` | `gatewayTransactionId` and IDs | `gatewayRawSafeJson` |
| --- | --- | --- | --- |
| Self | RAW (own) | HIDDEN | HIDDEN |
| ADMIN_COMMERCIAL | RAW | RAW (action gating only) | HIDDEN |
| ADMIN_FINANCE / SUPERADMIN | RAW | RAW | RAW |

## 9. `PaymentGatewayCredential` and `CybersourceGatewayCredential`

**API surfaces (current → target).**
- `GET /PATCH /api/v1/admin/payments/{authnet,cybersource}` — SUPERADMIN only; encrypted secrets HIDDEN (write-only); `*Last4` and non-secret toggles RAW; *target*: + `AuditLog payment.gateway.credential.read` on every successful decrypt by `getResolvedAuthNetConfig` / Cybersource adapter (roadmap (a)).
- Test connection routes — SUPERADMIN only; result RAW.

| Field group | Tier | Encryption | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- | --- |
| Encrypted secrets (`apiLoginIdEncrypted`, `transactionKeyEncrypted`, `merchantIdEncrypted`, `keyIdEncrypted`, `sharedSecretEncrypted`, etc.) | RESTRICTED_COMPLIANCE | **AES-256-GCM** | SUPERADMIN only via PATCH route | as long as gateway active + 12m | MINIMAL | NEVER |
| `*Last4` hints, `enabled`, `environment`, debug flags | INTERNAL | — | SUPERADMIN | as above | MINIMAL | NEVER |
| `lastTestStatus`, `lastTestedAt` | INTERNAL | — | SUPERADMIN | 12m | MINIMAL | NEVER |

## 10. `BankReadinessStatus` adjacent — `AuditLog`

| Field | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `id`, `actorId`, `action`, `createdAt`, `ip` | INTERNAL | admin (`admin:audit:read`) + finance for finance-scoped events | 24m hot + 5y cold | MINIMAL | SUMMARY_ONLY |
| `metadata` (Json) | INTERNAL — but field-level care; sanitisation enforced at write | as above | as above | RISK — engineering convention REQUIRES sanitisation; no raw secrets, no decrypted bank account, no résumé contents. | NEVER |

## 11. `JobApplication` and `ApplicationSubmission`

**API surfaces (current → target).**
- `POST /api/v1/jobs/[slug]/apply` — public; only the applicant submits.
- Admin hiring drawer — RAW for HR-scoped admin; *target*: + `AuditLog application.{created,stage_changed,withdrawn}` (roadmap (a)).
- Self-serve withdrawal — *target*: token-link from the confirmation email opens a `CONSENT_WITHDRAWAL` row in `/admin/privacy/requests` (roadmap (d)).

**Target visibility.**
| Role | `name` / `email` / `phone` | `resumeUrl` (file) | `notes` (free-text) |
| --- | --- | --- | --- |
| Applicant (self) | RAW (own; submitted, never returned in lists) | RAW (own download) | HIDDEN (admin-only) |
| Admin HR | RAW | RAW | RAW (with drift-hint banner — roadmap (b)) |
| Anyone else | HIDDEN | HIDDEN | HIDDEN |


| Field | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `JobApplication.name`, `email` | INTERNAL | admin (HR) | 12m post-decision | MINIMAL | ALLOWED_WITH_REDACTION |
| `JobApplication.phone` | INTERNAL | admin (HR) | 12m post-decision | **OVER-COLLECTED for non-phone-contact roles**; recommend optional unless template requires. | ALLOWED_WITH_REDACTION |
| `JobApplication.resumeUrl` | RESTRICTED_COMPLIANCE | admin (HR) | 12m post-decision | RISK — résumés can incidentally contain Art. 4 sensitive data; treat file as RESTRICTED. | NEVER (raw file) / ALLOWED_WITH_REDACTION (extracted skills only) |
| `JobApplication.notes` | RESTRICTED_COMPLIANCE if free-text | admin (HR) | 12m post-decision | RISK — free-text | NEVER |
| `ApplicationSubmission.submissionDataJson`, `normalizedSnapshotJson` | INTERNAL → can carry RESTRICTED depending on template | admin (HR) + applicant (own) | 12m post-decision | MINIMAL when template is field-typed; RISK when template includes free-text | NEVER for raw; SUMMARY_ONLY for stats |
| `ApplicationDocument.fileUrl` | RESTRICTED_COMPLIANCE | admin (HR) + applicant (own) | 12m post-decision | RISK — same as résumé | NEVER |

## 12. `JobPost`, `Series`, `Session`, `Experience*` content

| Field group | Tier | Visibility | Retention | Data-min | AI |
| --- | --- | --- | --- | --- | --- |
| `JobPost.title`, `slug`, `descriptionHtml`, `location`, `employmentType`, `compensationRange`, `publishedAt`, `closedAt` | PUBLIC | anyone | indefinite while published; 24m archive | MINIMAL | N/A — public |
| `Series.title`, `slug`, `summary`, `coverImageUrl`, `tags` | PUBLIC | anyone | indefinite while published | MINIMAL | N/A — public |
| `Session.startsAt`, `endsAt`, `capacity`, `venueId`, `pricingRule` | PUBLIC | anyone | event date + 24m | MINIMAL | N/A — public |
| `Experience*` content fields (title, descriptionHtml, longDescription, gallery, hostUserIds, addons) | PUBLIC | anyone | event date + 24m | MINIMAL | N/A — public |
| `internalCurationNotes` (if present) | INTERNAL → RISK of free-text drift | admin only | 24m | RISK | NEVER |

## 13. `NewsletterSubscription`

| Field | Tier | Retention | Data-min | AI |
| --- | --- | --- | --- | --- |
| `email` | INTERNAL | until withdrawn → suppression-hash thereafter | MINIMAL | NEVER |
| `locale`, `source`, timestamps | INTERNAL | as above | MINIMAL | SUMMARY_ONLY |

## 14. `Notification`, `EventLog` (operational)

| | |
| --- | --- |
| Tier | INTERNAL |
| Retention | 24m hot, 12m cold thereafter |
| AI exposure | NEVER for raw payload (may contain user-specific text); SUMMARY_ONLY for counts. |

## 15. Operational reservation/check-in models (`Ticket`, `ExperienceCheckin`, `ExperienceWaitlist`, INVU correlation rows)

| | |
| --- | --- |
| Tier | INTERNAL (the buyer's identity is the linked PII) |
| Retention | 24m post-event |
| AI exposure | SUMMARY_ONLY |

## 16. RoadblOcks / known free-text drift risks (cross-cut)

These are the fields that are *typed* as INTERNAL but which engineering
notes warn can slip into RESTRICTED if admins paste sensitive content:

- `User.internalNotes`
- `BeneficiaryProfile.adminVerificationNotes`
- `BeneficiaryProfile.complianceHoldReason`
- `OrderNote.body`
- `JobApplication.notes`
- `ApplicationSubmission.submissionDataJson` (when template includes
  free-text)
- `AuditLog.metadata` (sanitised at every call site, but a regression
  could leak)

For each of these, the roadmap phase (b) — field-level access hardening calls for an admin-side hint banner
("Do not paste bank account numbers or document contents here").

## 17. Audit-action inventory grouped by domain

The list below enumerates the canonical `AuditLog.action` strings (and
`UserAuditLog` actions where the model is separate) currently emitted by
the codebase. It exists so the roadmap phase (a) ("sensitive-access
audit events + log-scrubbing guardrail") and any future
`/admin/privacy/requests` register can be built without re-scanning the
repo. Source: `rg "auditLog\.create" src/`. **Sanitisation rule applies
to every action below**: `metadata` MUST NOT include raw secrets,
decrypted bank account numbers, document file contents, résumé text, or
encryption keys. Verified at write site today; a future log-scrubbing
guardrail (roadmap phase a) will assert this in CI.

### Beneficiary domain
- `beneficiary.upsert.*` (insert / update via `upsertOwnProfile`,
  `src/server/beneficiaries/beneficiaryService.ts`)
- `beneficiary.transition` (state-machine moves; reason carried in
  metadata — see free-text drift note in §16)
- Document service actions in
  `src/server/beneficiaries/beneficiaryDocumentService.ts` (upload,
  status change, soft-delete) — three call sites

### Payouts domain
- Payout batch lifecycle via `src/server/payouts/payoutAudit.ts`
  (`payouts.batch.{draft,submit,approve,reject,export,...}`)
- Maker/checker enforcement audits

### Commerce / Payments domain
- `payment.gateway.authnet.{update,test.succeeded,test.failed}`
- `payment.gateway.cybersource.{update,clear,test.succeeded,test.failed}`
- `payment.gateway.active.changed{,.rejected}`
- `checkout.charge.{succeeded,failed}` and refund/void:
  `order.refund.{succeeded,failed}`, `order.void.{succeeded,failed}`
  (refund/void route by `Payment.provider` — never re-resolved through
  the active gateway)
- Order cancellations (`src/app/api/v1/admin/orders/[id]/cancel/route.ts`)
- Comp ticket issue + CSV export (`admin.tickets.comp_issued`,
  `admin.tickets.export`)

### User-admin domain
- `UserAuditLog` (separate model) — role grants/revokes, suspension,
  forced logout, locking
- Influencer profile updates (`src/app/api/v1/me/influencer-profile/route.ts`)
- Operator creation pipeline (`src/app/api/v1/operators/create/route.ts`
  — three audit calls)

### Trust & Revenue domain
- Revenue session status transitions
  (`src/app/api/v1/admin/revenue/sessions/[id]/status/route.ts`)
- Revenue allocation lifecycle (approve/reverse/dispute/mark-paid —
  four routes)
- Referral organisation audit
  (`src/server/referrals/organizationAudit.ts`)
- Revenue audit helper (`src/server/revenue/revenueAudit.ts`)

### INVU / POS domain
- Match service correlations (`src/server/services/invu/invuMatchService.ts`)
- Commission minting (`src/server/services/invu/commissionMintingService.ts`)
- Aggregation runs (`src/server/services/invu/invuAggregationService.ts`)
- Generic INVU audit helper (`src/server/services/invu/invuAuditService.ts`)
- Table-binding cancellations
  (`src/app/api/v1/admin/integrations/invu/table-sessions/[id]/cancel-binding/route.ts`)

### Experiences / Hiring / SOP domain
- `EXPERIENCE_CREATED` / `EXPERIENCE_UPDATED` (admin experiences routes)
- Experience duplication
- Hiring (`JobApplication`, `ApplicationSubmission`) — **gap**: no
  dedicated audit action today for new applications or stage
  transitions. Roadmap phase (a) should add `application.{created,
  stage_changed,withdrawn}`.

### Coverage exceptions
Schema models intentionally NOT individually classified above (because
they hold no PII / financial / compliance data, or because they are
operational-only): `Role`, `UserRole`, `Series`, `TicketType`,
`TicketPricingRule`, `ExperienceAddon`, `ExperienceAnalyticsDaily`,
`Membership`-plan-config, `SopDocument`, `SopAcknowledgement`,
`Opportunity`, `FormTemplate`, `ApplicationPipeline`,
`ApplicationPipelineStage`, public-content event-log rows. Any new
model that lands in `prisma/schema.prisma` MUST be evaluated for
inclusion as part of the same PR — process rule per
`panama-law-81-audit.md` §4.2.

## 18. Encryption coverage matrix (summary)

| Field | Encrypted at rest (app-level)? | Why / why not |
| --- | --- | --- |
| `BeneficiaryProfile.banescoAccountNumberEncrypted` | ✅ AES-256-GCM | Highest harm potential. |
| `PaymentGatewayCredential.*Encrypted` | ✅ AES-256-GCM | Production payment secrets. |
| `CybersourceGatewayCredential.*Encrypted` | ✅ AES-256-GCM | Same. |
| INVU credentials | ✅ AES-256-GCM | Vendor secrets. |
| `User.email`, `phone`, `name` | ❌ — host-disk only | Field-level encryption would break query/login. Mitigated by RBAC + retention + future row-level audit. |
| `BeneficiaryDocument` files | ❌ field-level — but private-bucket ACL + host-disk encryption | Files are large; ACL + bucket isolation is the appropriate control. Engineering must verify the bucket has versioning + retention-lock for the 90-day post-`BANK_READY` purge to be enforceable. |
| `AuditLog.metadata` | ❌ | Sanitised at write — never contains secrets. |
| `Payment.gateway*` ids | ❌ | Necessary as-is to action refunds/voids; not directly identifying. |
