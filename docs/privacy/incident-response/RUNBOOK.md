# Personal Data Breach Response Runbook — OKÜ Panama

> **This is an engineering operational runbook, not legal advice.**
> Notification thresholds, wording, and timing must be approved by
> Panama counsel and the named DPO. Counsel review of this runbook is
> **PENDING** at the time of file creation.

> **Bank vs. KYC.** OKÜ performs beneficiary verification and
> payout-eligibility checks. Banesco performs formal banking/KYC/AML.
> A Banesco-side incident is handled here as a **vendor breach
> notice** (§1.3 below), not as an OKÜ-controller incident.

> **Banesco verbatim caveat.** *"Banesco bulk-payment export may
> introduce additional required fields. Any new field required by
> Banesco must be classified before implementation and must not be
> added directly to exports without privacy review."* This applies
> here too — when triaging a Banesco-related incident, do not assume
> the export contained only the fields documented in
> `docs/privacy/data-classification.md`; verify against the export
> manifest of the day.

---

## On-call decision-makers (fill in before launch)

| Role                                       | Name                                                  | Reachable via                                                   | Backup                                                                              |
| ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Data Protection Officer (DPO)**          | Denzil Nelson (Privacy / Data Protection Lead)        | `okupanama@gmail.com` (DPO inbox) · `denzil@totalprobermuda.com` · +1-441-703-2920 | Tonka Simpson (Technical Security Owner) — `okupanama@gmail.com` · +1-441-535-5055  |
| **Engineering on-call**                    | Rotating per current schedule                         | Internal pager                                                  | Engineering lead                                                                    |
| **Panama counsel (external)**              | José María Redondo — CR&A (https://www.cra.legal/)    | `jredondo@cra.legal` · +507-261-1472                            | Manuel González — CR&A — `mgonzalez@cra.legal` · +507-261-1472                      |
| **Executive sponsor**                      | Denzil Nelson (Founder & CEO, Total Pro)              | `denzil@totalprobermuda.com` · +1-441-703-2920                  | Tonka Simpson — `okupanama@gmail.com` · +1-441-535-5055                             |
| **Communications lead (subject notice)**   | Denzil Nelson                                         | `denzil@totalprobermuda.com` · +1-441-703-2920                  | Tonka Simpson — `okupanama@gmail.com` · +1-441-535-5055                             |

> The monitored DPO inbox of record is **`okupanama@gmail.com`** —
> this is the address vendors must use for DPA breach notices
> (§1.3) and the address that appears in the From / Reply-to lines
> of the data-subject notification template.

> No single field above may be left blank when OKÜ Panama goes live
> for paid attendees. The DPO row is the canonical source of truth
> for the on-call decision-maker referenced throughout this runbook.

---

## 1. Detection sources

The following are the channels through which OKÜ becomes "aware"
(Decree 285 Art. 38) of a possible personal data breach. The
"without undue delay" clock starts at first awareness via any of
them.

### 1.1 Sentry (`SENTRY_DSN`-gated)

If Sentry is enabled, alert rules must be configured for:

- Spikes in 5xx on `/api/v1/admin/*`, `/api/v1/me/*`, `/api/v1/checkout/*`.
- Any uncaught exception originating in
  `src/server/payments/**`, `src/server/beneficiaries/**`,
  `src/server/authorizeNet/**`, `src/server/cybersource/**`,
  `src/server/ai/**` (when added), or any `crypto`-using module.
- Decryption failures against AES-256-GCM-encrypted columns
  (beneficiary bank, payment gateway credentials).

Sentry payloads are scrubbed (see `cross-border-transfers.md` §2.8);
a Sentry alert is *signal*, not evidence — pull the matching
`AuditLog` row before drawing conclusions.

### 1.2 Audit-log anomalies

`AuditLog` entries that should trigger triage. Detection is
automated by the audit-anomaly scanner
(`src/server/audit/anomalyDetector.ts` + `anomalyAlerter.ts`),
which runs every 15 minutes via the BullMQ worker
(`worker/jobs/audit-anomaly-scan.ts`). Each detection pages through
`captureMessage` (the same sink as Sentry alerts — DPO + engineering
on-call subscribe there) **and** writes an `audit.anomaly.alert`
AuditLog row whose `metadata.sourceAuditIds` lists the rows that
triggered the signal. Triage starts by looking those ids up directly
in `AuditLog`.

Patterns covered (letters match `signalKey` prefixes):

- **A.** `payment.gateway.{authnet,cybersource}.test.failed`
  clusters (default ≥5 in 1h, override
  `ALERT_PAYMENT_TEST_FAILURE_THRESHOLD`).
- **B.** `payment.gateway.active.changed.rejected` followed within
  24h by a successful `payment.gateway.active.changed` from a
  *different* actor (escalation indicator — fires once per pair).
- **C.** `beneficiary.status.transition` to `REJECTED` / `ON_HOLD`
  by the same actor on >5 distinct beneficiaries in 24h
  (`ALERT_BENEFICIARY_BULK_REJECT_THRESHOLD`).
- **D.** Any `admin.tickets.export` with `metadata.rowCount` >1k
  (`ALERT_TICKET_EXPORT_ROW_THRESHOLD`).
- **E.** `admin.beneficiary.search` returning bank-field values
  (`metadata.matchedBankField === true`) — should be impossible; if
  it ever appears, treat as a RESTRICTED_COMPLIANCE incident.
- **F.** `auth.admin.denied` clusters — ≥10 from a single IP in
  10m (`ALERT_ADMIN_DENIED_PER_IP_THRESHOLD`) or ≥30 globally in
  10m (`ALERT_ADMIN_DENIED_GLOBAL_THRESHOLD`). Universal coverage
  is provided by Edge middleware (`src/middleware.ts`): every
  request to `/api/v1/admin/**` that fails the session check (401)
  or the admin-role check (403) fires-and-forgets a signed POST to
  `/api/internal/audit/admin-denied` (HMAC-SHA256 of body using
  `NEXTAUTH_SECRET`), which writes the `auth.admin.denied` row with
  the client IP. Per-route handlers additionally emit denial rows
  for finer SUPERADMIN-only / permission-key checks via
  `requireAdminPermission` / `requireAdminRoles` in
  `src/server/auth/adminGuard.ts`.

The scanner dedupes by `signalKey` against
`audit.anomaly.alert` rows in the prior 6h, so an unresolved
situation re-pages once per shift instead of every 15 minutes.

### 1.3 Vendor breach notice

Vendors in `docs/privacy/cross-border-transfers.md` §2 (Replit,
Resend, Cybersource, Sentry, Cloudmersive, Banesco, future AI
vendor) are contractually obliged via their DPAs to notify OKÜ of
breaches affecting our data. Inbound channel is the DPO email above;
backup is the executive sponsor.

A vendor notice **starts the OKÜ awareness clock** the moment it
arrives in DPO inbox — even if the vendor's own clock started
earlier. Save the vendor's notice (PDF / email) into the incident
folder for evidence.

### 1.4 User report

A data subject reporting an apparent leak (e.g. "I received an email
addressed to someone else"). Front-line support escalates
immediately to the DPO; the support response must NOT confirm or
deny that a breach occurred until triage is complete.

### 1.5 Internal discovery

Engineer notices the issue while developing or QA-ing. Engineer
files the incident the same way an on-call alert would be filed —
no "I'll fix it quietly" path exists.

### 1.6 Pentest / responsible disclosure

External researcher contacts OKÜ. Treated as detection at the moment
of receipt at any OKÜ-controlled inbox.

---

## 2. Containment (first 60 minutes)

These steps run in parallel where possible. The on-call engineer
records every action with a UTC timestamp into the incident draft —
those timestamps are what become `containmentSummary` in the
register row.

1. **Acknowledge.** Engineer on-call acknowledges the alert /
   notice. Pages the DPO.
2. **Open the incident draft.** Copy the row template from
   `REGISTER.md` into a working doc. Assign the next
   `INC-YYYY-NNN` id.
3. **Stop the bleeding.** Choose the least-impactful containment
   step that stops further exposure:
   - Feature-flag the offending route off (preferred — preserves
     forensic state).
   - Revoke compromised credentials (rotate
     `APP_ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, gateway secrets,
     OAuth client secrets — see
     `docs/privacy/data-classification.md` for the canonical list
     of secrets).
   - Suspend specific admin sessions / accounts.
   - Take a route to a maintenance page only as a last resort.
4. **Preserve evidence.** Snapshot the relevant `AuditLog` rows,
   Sentry events, and any vendor notice. Do **not** delete or
   modify production data to "clean up".
5. **Scope the blast radius.** Identify affected categories and a
   first-pass `subjectsAffectedRange` (1–10 / 11–100 / 101–1k /
   >1k). Precise count comes later — do not block notification
   triage waiting for an exact number.
6. **Notify internally.** DPO notifies executive sponsor +
   communications lead. Engineering on-call notifies engineering
   lead. Counsel is looped in by the DPO before any external
   communication is drafted.

---

## 3. Triage decision tree — does this meet the Law 81 personal-data-breach threshold?

> Counsel-approved decision. Engineering on-call **prepares the
> evidence**; the DPO + counsel **make the call**. Engineering does
> not unilaterally decide either way.

```
                  ┌────────────────────────────────────────┐
                  │ Was personal data of a Panamanian data │
                  │ subject involved?                      │
                  └──────────────┬─────────────────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │ NO                          │ YES
                  ▼                             ▼
        Log row in register with     ┌───────────────────────────────┐
        DO_NOT_NOTIFY + rationale.   │ Confidentiality, integrity,   │
        Close.                       │ or availability compromised?  │
                                     └──────────────┬────────────────┘
                                                    │
                                       ┌────────────┴────────────┐
                                       │ NO                      │ YES
                                       ▼                         ▼
                             Log + DO_NOT_NOTIFY.    ┌────────────────────────────┐
                             Close.                  │ Could the breach plausibly │
                                                     │ result in risk to rights & │
                                                     │ freedoms of the subject?   │
                                                     │ (financial loss, identity  │
                                                     │  fraud, discrimination,    │
                                                     │  reputational harm, loss   │
                                                     │  of confidentiality of     │
                                                     │  professional secrecy.)    │
                                                     └──────────────┬─────────────┘
                                                                    │
                                                       ┌────────────┴────────────┐
                                                       │ LOW                     │ MEDIUM/HIGH
                                                       ▼                         ▼
                                          ANTAI: usually DO_NOT_NOTIFY   ANTAI: NOTIFY
                                          (counsel records rationale).   without undue delay
                                          Subjects: DO_NOT_NOTIFY.       (target ≤72h from
                                          Close.                         awareness, mirroring
                                                                         GDPR practice — see
                                                                         §7 of audit).
                                                                                 │
                                                                                 ▼
                                                              ┌──────────────────────────────┐
                                                              │ Is the risk to subjects HIGH? │
                                                              │ (raw bank credentials,        │
                                                              │  passwords, identity docs,    │
                                                              │  sensitive special-category   │
                                                              │  data, scoped financial info) │
                                                              └──────────────┬───────────────┘
                                                                             │
                                                                ┌────────────┴────────────┐
                                                                │ NO                      │ YES
                                                                ▼                         ▼
                                                     Subjects: DO_NOT_NOTIFY    Subjects: NOTIFY
                                                     unless counsel says        directly without
                                                     otherwise.                 undue delay (ANTAI
                                                                                template + subject
                                                                                template, §6).
```

Special cases that bypass the tree and **always require counsel
sign-off before closure**:

- Any incident touching `beneficiary.bank` raw account number
  (encrypted-at-rest decryption failure that produced plaintext in a
  log, or successful exfiltration).
- Any incident touching `payments.metadata` beyond last4 / txid (raw
  PAN/CVV should be impossible — Cybersource Microform / Authorize.net
  hosted fields keep them out of OKÜ — but if it happens, this is the
  highest-severity path).
- Any incident touching `account.credentials` (hashed passwords or
  OAuth tokens at rest).
- Any vendor breach where the vendor's notice itself is unclear on
  scope — assume worst-case until clarified in writing.

---

## 4. Notification chain

Once the DPO + counsel have made the call from §3:

### 4.1 ANTAI notification (where required)

1. Counsel finalises the ANTAI letter from the template at
   `docs/privacy/incident-response/templates/antai-notification-letter.md`.
2. DPO submits via the channel ANTAI publishes for breach
   notifications at the time of incident (file the channel used into
   the register row).
3. ANTAI acknowledgement / case number is recorded in
   `antaiNotificationReference`.
4. If the full picture is not yet known at first filing, a
   **DEFERRED** initial filing is made under Decree 285 Art. 38's
   "without undue delay" provision, with a follow-up filing once
   investigation completes. Both filings appear as separate rows in
   the register, cross-linked via `relatedIncidentIds`.

### 4.2 Data-subject notification (where required)

1. Communications lead drafts from
   `docs/privacy/incident-response/templates/data-subject-notification-email.md`,
   counsel reviews, DPO approves.
2. Send via the address the subject most recently used on OKÜ
   (account email of record). Postal / phone fallback only when
   counsel directs.
3. ES + PT translations of the approved EN copy go out in the same
   send window — do not stagger by language. (Translation files
   should land alongside the EN template before launch; see §8.)
4. Subjects who cannot be reached are recorded as "attempted —
   undeliverable" with the bounce reason; counsel decides on public
   notice.

### 4.3 Internal "all-clear"

Once both notification chains close (or are confirmed not required),
DPO marks the register row `closedAt` + `closedBy`. Engineering
remediation tickets remain open until merged.

---

## 5. Standing controls (so we don't keep making the same mistake)

These are the recurring checks that on-call should validate after
**any** incident before closing the row:

- The `?q=` admin search allow-lists in
  `src/server/admin/**` still deny RESTRICTED_COMPLIANCE fields —
  most importantly `beneficiary.bank.*`,
  `adminVerificationNotes`, `complianceHoldReason`,
  document contents.
- CSV/Excel exports route through the formula-injection wrapper
  (`= + - @ \t \r` prefix sanitisation) — see roadmap §(g).
- Demo back-doors (`DEMO_MODE_ENABLED`) are off in
  `NODE_ENV=production`.
- `APP_ENCRYPTION_KEY` is set and 32-byte base64 / utf8;
  decryption smoke test passes.
- Audit-log retention is intact for the period covering the
  incident — never truncate logs to "tidy up" a remediation.

---

## 6. Templates (counsel review status: PENDING)

These live as separate files alongside this runbook so they can be
diff-reviewed by counsel without churning the runbook:

- `docs/privacy/incident-response/templates/antai-notification-letter.md`
  — letter to the supervisory authority. EN now; ES + PT counsel
  translations follow §8.
- `docs/privacy/incident-response/templates/data-subject-notification-email.md`
  — email to the affected data subject. EN now; ES + PT counsel
  translations follow §8.

Until counsel returns their review, the templates carry a `[COUNSEL
REVIEW PENDING — DO NOT SEND AS-IS]` banner at the top. The DPO is
the only person authorised to remove the banner, and only after
written counsel approval.

---

## 7. Post-mortem cadence

- **Hot wash (within 48h of closure).** Engineering on-call + DPO
  walk through the timeline. Output: a draft `lessonsLearned` for
  the register row.
- **Written post-mortem (within 10 business days of closure).**
  Engineering authors a blameless post-mortem in
  `docs/privacy/incident-response/postmortems/INC-YYYY-NNN.md`.
  Sections: timeline, contributing factors, what went well, what
  went poorly, action items with owners and dates.
- **Quarterly trend review.** DPO reviews all rows opened in the
  prior quarter, looks for recurring categories or detection-source
  gaps, files improvements into the roadmap. A quarter with zero
  incidents still gets a one-line entry confirming the review
  happened — accountability evidence under Law 81.
- **Annual tabletop.** DPO runs a tabletop exercise simulating a
  vendor breach notice (Banesco or Cybersource) and a
  RESTRICTED_COMPLIANCE leak. Outcome and any runbook patches
  documented in `docs/privacy/incident-response/postmortems/`.

---

## 8. Translations

EN is the source of truth for the templates in §6. ES and PT
translations are produced by counsel-reviewed translators (not
machine-translated for legal text) and stored as sibling files:

- `templates/antai-notification-letter.es.md`,
  `templates/antai-notification-letter.pt.md`
- `templates/data-subject-notification-email.es.md`,
  `templates/data-subject-notification-email.pt.md`

As of this commit the ES and PT sibling files exist alongside the EN
templates with the same `[COUNSEL REVIEW PENDING — DO NOT SEND
AS-IS]` banner. Counsel must review and approve all three locales
before the banner is removed; the DPO removes the banner from EN, ES
and PT in a single change so the locales never drift in approval
status. Until then, no non-English send may go out.
