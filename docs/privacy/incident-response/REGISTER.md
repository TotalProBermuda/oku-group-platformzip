# Personal Data Breach Incident Register — OKÜ Panama

> **This is an engineering privacy artefact, not legal advice.** Final
> notification decisions, wording, and timing must be approved by
> Panama counsel and the named DPO. Counsel review of this register
> template is **PENDING** at the time of file creation.

> **Bank vs. KYC.** OKÜ performs beneficiary verification and
> payout-eligibility checks. Banesco performs formal banking/KYC/AML.
> A breach of OKÜ-stored beneficiary data is an OKÜ-controller
> incident; a breach inside Banesco's environment is a vendor incident
> tracked under "vendor breach notice" (see `RUNBOOK.md`).

---

## Purpose

This file is the **authoritative log** of every personal-data
incident OKÜ Panama opens, regardless of whether it ultimately
qualifies as a notifiable personal data breach under Law 81 Art. 31
or Decree 285 Art. 38. Negative determinations (i.e. "we triaged it,
it was not a personal data breach") are recorded here too — Law 81
accountability requires that the controller can demonstrate the
triage happened.

- **One row per incident.** Even if the same root cause spawns
  follow-up incidents, each gets its own row, cross-linked via
  `relatedIncidentIds` in `containmentSummary`.
- **Append-only.** Rows are never deleted. Corrections are made by
  appending a follow-up row that references the original
  `incidentId` and explains the correction.
- **Authoritative timestamps.** All timestamps are recorded in
  `YYYY-MM-DDTHH:MM:SSZ` (UTC). Local Panama time may be added in
  parentheses for human readability but UTC is the source of truth.
- **Counsel sign-off.** The `antaiNotificationDecision` and
  `subjectNotificationDecision` cells must be filled in by, or with
  written approval from, Panama counsel. The DPO records the counsel
  approver name in `closedBy` along with their own.

---

## Row template (copy this for each new incident)

```
### INC-YYYY-NNN — <one-line title>

| Field                            | Value                                      |
| -------------------------------- | ------------------------------------------ |
| incidentId                       | INC-YYYY-NNN                               |
| detectedAt                       | YYYY-MM-DDTHH:MM:SSZ                       |
| detectionSource                  | sentry / audit-log-anomaly / vendor-notice / user-report / internal-discovery / pentest / other |
| reporter                         | <name + role>                              |
| affectedCategories               | (see "Affected categories" below)          |
| subjectsAffectedCount            | <integer or "unknown — under investigation"> |
| subjectsAffectedRange            | (e.g. "1–10", "11–100", "101–1k", ">1k")   |
| containmentSummary               | <what we did to stop the bleeding, with timestamps and relatedIncidentIds> |
| antaiNotificationDecision        | NOTIFY / DO_NOT_NOTIFY / DEFERRED          |
| antaiNotificationDecisionRationale | <Law 81 Art. 31 threshold reasoning, counsel-approved> |
| antaiNotifiedAt                  | YYYY-MM-DDTHH:MM:SSZ or N/A                |
| antaiNotificationReference       | <ANTAI case / acknowledgement number>      |
| subjectNotificationDecision      | NOTIFY / DO_NOT_NOTIFY / DEFERRED          |
| subjectNotificationDecisionRationale | <reasoning, counsel-approved>          |
| subjectsNotifiedAt               | YYYY-MM-DDTHH:MM:SSZ or N/A                |
| subjectNotificationChannel       | email / postal / in-app / other            |
| remediation                      | <code, process, vendor-side fixes; link PRs / runbooks / tickets> |
| lessonsLearned                   | <what changed in the runbook, controls, tests, training>           |
| closedAt                         | YYYY-MM-DDTHH:MM:SSZ                       |
| closedBy                         | <DPO name> + <counsel approver name>       |
```

### Affected categories

Use the canonical category names from
`docs/privacy/data-classification.md`. Multiple values allowed,
comma-separated. Examples:

- `account.identity` (name, email, phone)
- `account.credentials` (hashed password, OAuth tokens)
- `beneficiary.bank` (Banesco account number, bank-readiness docs)
- `beneficiary.documents` (uploaded ID, RUC, etc.)
- `payments.metadata` (last4, gateway txn ids — never raw PAN/CVV)
- `attendance.profile` (membership, ticket history)
- `hr.application` (résumé content)
- `audit.metadata` (admin action logs)
- `vendor.replit` / `vendor.resend` / `vendor.cybersource` /
  `vendor.sentry` / `vendor.cloudmersive` / `vendor.banesco` — when
  the breach is on a vendor side.

---

## Worked-example row (template only — DO NOT treat as a real incident)

> This row is illustrative. It is here so on-call has a concrete
> example to copy from at 02:00 local time. Real incidents start a
> fresh `INC-YYYY-NNN` numbering from `INC-2026-001`.

### INC-EXAMPLE — Mis-scoped admin search returned account number last4 to a non-finance admin

| Field                                | Value                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| incidentId                           | INC-EXAMPLE                                                                                                                          |
| detectedAt                           | 2026-05-14T18:32:11Z                                                                                                                 |
| detectionSource                      | internal-discovery (engineer running a manual QA pass)                                                                               |
| reporter                             | Jane Engineer (engineering)                                                                                                          |
| affectedCategories                   | beneficiary.bank (last4 only)                                                                                                        |
| subjectsAffectedCount                | 3                                                                                                                                    |
| subjectsAffectedRange                | 1–10                                                                                                                                 |
| containmentSummary                   | 18:40Z — feature-flagged the search route off in prod. 18:55Z — patched the allow-list. 19:30Z — re-enabled. relatedIncidentIds: none. |
| antaiNotificationDecision            | DO_NOT_NOTIFY                                                                                                                        |
| antaiNotificationDecisionRationale   | Counsel determined no personal-data-breach threshold met under Law 81 Art. 31: only last4 (non-identifying alone) was exposed to an internal admin already cleared for INTERNAL data; no exfiltration outside OKÜ. Logged here for accountability. |
| antaiNotifiedAt                      | N/A                                                                                                                                  |
| antaiNotificationReference           | N/A                                                                                                                                  |
| subjectNotificationDecision          | DO_NOT_NOTIFY                                                                                                                        |
| subjectNotificationDecisionRationale | No high risk to rights and freedoms; last4 alone does not enable account access or impersonation.                                    |
| subjectsNotifiedAt                   | N/A                                                                                                                                  |
| subjectNotificationChannel           | N/A                                                                                                                                  |
| remediation                          | PR #XXXX added the field to the deny-list in `?q=` allow-list and added a regression test in `src/server/admin/__tests__/search-allowlist.test.ts`. |
| lessonsLearned                       | Added `beneficiary.bank.*` fields to the standing search-allow-list checklist in `RUNBOOK.md` §5. Added the check to the PR template. |
| closedAt                             | 2026-05-15T16:00:00Z                                                                                                                 |
| closedBy                             | <DPO name TBD> + <counsel approver TBD>                                                                                              |

---

## Real incidents

> Append new rows below this marker, newest at the bottom. The first
> real entry will be `INC-2026-001`.

<!-- BEGIN REAL INCIDENTS -->
<!-- (none yet) -->
<!-- END REAL INCIDENTS -->
