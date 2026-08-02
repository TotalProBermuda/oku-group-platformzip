# ANTAI Personal Data Breach Notification Letter — Template (EN)

> **[COUNSEL REVIEW PENDING — DO NOT SEND AS-IS]**
>
> This template is an engineering draft prepared so the on-call team
> has a starting point. Panama counsel must review and approve the
> final wording, the channel of submission, and the timing before any
> filing is made with ANTAI. The DPO is the only person authorised to
> remove this banner, and only after written counsel approval.

> **This is an engineering operational artefact, not legal advice.**

---

**To:** Autoridad Nacional de Transparencia y Acceso a la Información
(ANTAI), República de Panamá
**Channel:** _Confirm with counsel at time of filing — channels
published by ANTAI for personal data breach notifications change._
**From:** OKÜ Group, S.A. — _legal entity name to be confirmed by
counsel_
**Data Protection Officer:** `<DPO name>`, `<DPO email>`,
`<DPO phone>`
**Date of this notice (UTC):** `<YYYY-MM-DD HH:MM Z>`
**Date of OKÜ awareness (UTC):** `<YYYY-MM-DD HH:MM Z>`
**Internal incident reference:** `INC-YYYY-NNN`

---

## 1. Notice type

- [ ] Initial notification (full picture not yet known — follow-up
  filing to follow under Decree 285 Art. 38 "without undue delay").
- [ ] Follow-up notification updating internal reference
  `INC-YYYY-NNN`.
- [ ] Final / closure notification.

## 2. Nature of the personal data breach

`<Plain-language description: what happened, how it happened, when
it happened, when OKÜ became aware. Include whether it concerns
confidentiality, integrity, or availability — or a combination.>`

## 3. Categories and approximate number of data subjects affected

- Categories of data subjects: `<e.g. paying attendees in Panama;
  beneficiaries onboarded for Banesco payouts; staff applicants>`.
- Approximate number affected: `<integer or range — 1–10 / 11–100 /
  101–1k / >1k>`.
- Basis for the estimate: `<e.g. AuditLog query over the affected
  endpoint between <start> and <end>>`.

## 4. Categories and approximate volume of personal data records

- Categories of personal data: `<map to canonical names from
  docs/privacy/data-classification.md — e.g. account.identity,
  beneficiary.bank (last4 only), payments.metadata>`.
- Approximate number of records: `<integer or range>`.
- **Not affected** (explicit, where relevant): `<e.g. raw payment
  card numbers — these never enter OKÜ systems; raw beneficiary bank
  account numbers — encrypted at rest with AES-256-GCM and not
  decrypted in the affected path>`.

## 5. Likely consequences for affected data subjects

`<Plain-language assessment: identity-fraud risk, financial-loss
risk, reputational risk, loss of confidentiality of professional
secrecy, etc. State explicitly where the assessment is "low risk"
and why.>`

## 6. Containment and remediation measures

- Containment actions taken (with UTC timestamps): `<bullet list
  copied from REGISTER row containmentSummary>`.
- Remediation actions completed: `<list>`.
- Remediation actions in progress, with target dates: `<list>`.
- Recurrence-prevention measures: `<process / code / training
  changes>`.

## 7. Notification to affected data subjects

- [ ] Yes — notification was sent on `<YYYY-MM-DD>` via
  `<channel — typically email of record>`. ES + PT translations sent
  in the same window.
- [ ] No — counsel-approved rationale: `<rationale>`.
- [ ] Deferred — reason: `<reason>`; planned date: `<YYYY-MM-DD>`.

## 8. Cross-border / vendor dimension (where applicable)

`<If a vendor in docs/privacy/cross-border-transfers.md is involved
(Replit, Resend, Cybersource, Sentry, Cloudmersive, Banesco, future
AI vendor): name the vendor, the legal basis for the original
transfer, the date OKÜ received the vendor's breach notice, and a
copy reference for the vendor's notice.>`

## 9. Contact for follow-up

- DPO: `<name>`, `<email>`, `<phone>`.
- Backup: `<name>`, `<email>`, `<phone>`.
- Legal counsel: `<firm name>`, `<contact>`.

## 10. Attachments

- `<List: vendor breach notice (if any), redacted AuditLog excerpts,
  data-subject notification template actually used, etc.>`

---

_Signed,_

`<DPO name>`
Data Protection Officer, OKÜ Group, S.A.
