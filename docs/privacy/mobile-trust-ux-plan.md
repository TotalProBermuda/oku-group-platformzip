# Mobile-First Privacy & Trust UX Plan

> This is an engineering privacy audit, not legal advice. It captures
> what the OKÜ codebase implements today, what is missing relative to
> the Panama Law 81 / Decree 285 readiness work in #97, and what should
> be built next. It is **not** a legal opinion and does not replace
> review by qualified Panamanian privacy counsel before launch.

This doc is the UX counterpart of
`privacy-functionality-gap-assessment.md`. It specifies — surface by
surface — how the trust experience should feel on mobile and on the
admin desktop, and what reusable primitives the implementation phase
must build. It contains **no code** and **no images**. Visual mockups
are explicitly out of scope (see #98 task).

## Source-tag legend

- `[Official]` — Panama Law 81 of 2019, Decree 285 of 2021, ANTAI
  guidance.
- `[Secondary]` — DLA Piper / Dentons summaries.
- `[Internal inference]` — engineering / product judgement.

## Bank-vs-KYC reminder (verbatim, repeated in every beneficiary subsection)

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

## Banesco caveat (verbatim, repeated wherever exports / fields are recommended)

> Banesco bulk-payment export may introduce additional required
> fields. Any new field required by Banesco must be classified before
> implementation and must not be added directly to exports without
> privacy review.

---

# Seven design principles (verbatim — apply to every surface)

1. **Calm confidence.** The product behaves like a discreet
   concierge: minimal motion, no alarms, no exclamation marks. Trust
   is conveyed by clarity, not by colour.
2. **One decision per screen.** Each screen asks for one thing. The
   primary CTA is unambiguous. Secondary actions are demoted to text
   links.
3. **Visible protection.** When we hold something sensitive, we say
   so on the same screen — not three pages away. Lock icons, "access
   is logged" banners, and last-4 masking are first-class.
4. **Status before detail.** Every screen leads with the user's
   current state ("Bank-ready", "On hold", "Waiting on Banesco"),
   then offers detail beneath.
5. **Progressive disclosure.** Detail is hidden until requested;
   reveal is per-field, never bulk. Reveal is itself an audited
   action when restricted.
6. **No false certainty.** When OKÜ has approved but Banesco has not
   yet confirmed, we say so explicitly. We never claim KYC is
   complete. We never imply payout is guaranteed.
7. **No raw sensitive data.** Account numbers, full IDs, document
   bytes, and ciphertexts never round-trip to the client.
   `MaskedSensitiveField` is the only way these touch the UI.

---

# Visual style (modern minimalist, hospitality-grade)

`[Internal inference]`

- **Surfaces.** Warm off-white (`#fafaf7` / `#f5f3ee`) for admin and
  finance. The OKÜ-dark luxury palette is reserved for established
  earner dashboards (Influencer, Partner, Referrer) where it already
  signals premium status. Privacy/finance surfaces are intentionally
  lighter and quieter — they should feel like a notarial office, not
  a nightclub.
- **Accent colour.** OKÜ red (`#c41e3a`) is restrained: primary CTA,
  brand mark, single-line status accents. Never used as a panel fill.
- **State colour.** Green = verified / paid / bank-ready. Amber =
  pending / waiting / changes requested. Red = rejected / blocked /
  on hold. These are the **only** three semantic colours; everything
  else is neutral.
- **Radius.** 6–8px on cards, inputs, buttons, drawers. No pill
  cards. No nested cards. No glassmorphism on privacy surfaces.
- **No decorative blobs.** No gradients, no halos, no wallpaper
  imagery on privacy surfaces. The eye lands on text.
- **Typography.** Existing serif (Georgia / Playfair-style) for
  page titles and brand mark. Sans-serif for body, labels, status
  pills. 14–16px body; 11–12px labels; 22–28px page title.
- **Iconography.** Single weight, line style, 16–20px. Lock icon is
  reserved for sensitive fields and for the access-logged banner.
- **Density.** Dense tables (multi-row, narrow padding) only on
  desktop admin surfaces. Mobile is always single-column with
  generous vertical rhythm (24–32px between blocks).

---

# Mobile layout rules (canonical — apply to every mobile surface)

`[Internal inference]`

- **Width.** Design at 375px. Verify at 320px (no horizontal scroll)
  and 412px (no awkward gutters).
- **Sticky bottom action bar.** Primary CTA pinned to the bottom,
  full-width, 56px tall. Bar has a 1px top border and a soft 4-px
  shadow when content underneath scrolls.
- **44px touch targets.** Every interactive element ≥44×44px. Form
  inputs are 48px tall. Status chips are tap-only when they have a
  detail behind them.
- **Single column.** No side-by-side fields on mobile. Country code
  + phone number is the only acceptable horizontal split (and only
  on phone fields).
- **Single primary CTA per screen.** Secondary actions are text
  links above the bottom bar. "Cancel" is always a text link, never
  a button competing with the primary.
- **Inline-under-field error messages.** Errors render directly
  beneath the offending input, in `state.red` text, prefixed by the
  word "Error:" for screen readers. The field border turns red. No
  global error toast at the top.
- **Step indicator at top.** A 3–5 step pill row at the top of every
  multi-step flow ("Bank info · Documents · Review"). Current step
  is filled; past steps are check-marked; future steps are outlined.
- **No modals on mobile.** Use full-screen sheets that slide in
  from the bottom. Modal overlay is reserved for desktop.

---

# Admin layout rules (canonical — apply to every admin surface)

`[Internal inference]`

- **Queue + filters + tabs + search.** Every admin queue page has a
  left-edge filter rail (status, date, role), a top tab row (per
  status bucket or per data subject type), and a global search input
  in the header. Reuse `AdminPageShell` slots: `eyebrow`, `title`,
  `actions`, `kpiRow`, `filterBar`.
- **Drawer detail.** Detail opens in `SlideOverPanel` (right-edge,
  480–640px wide). Never a full-page navigation. Closing the drawer
  preserves the queue's scroll/filter state.
- **Masked fields by default.** Bank account, tax ID, document
  bytes — all masked. Reveal is per-field, audited, and renders a
  micro-toast "Access logged".
- **"Restricted compliance data — access is logged" banner.** Pinned
  at the top of every drawer that exposes restricted detail. Uses
  `RestrictedDataBanner` (a thin styled wrapper around
  `AlertStrip` with the lock icon).
- **Reject / request-changes / hold require a typed reason.** A
  modal appears with a 200–500-char textarea, a `Cancel` text link,
  and a primary "Confirm reject" / "Confirm changes requested" /
  "Confirm hold" button that is disabled until the reason is at
  least 10 characters. The reason is sent to the server, persisted,
  emailed to the beneficiary, and included in the AuditLog metadata.
- **Approve disabled until required checks pass.** "Approve" button
  is greyed out with hover/focus tooltip listing the missing checks
  (e.g. "Identification document still REJECTED",
  "Income certification expired"). The disabled state is keyboard-
  reachable — screen readers announce the blockers.
- **Audit ribbon.** Each drawer has a small "Last viewed by … on …
  · last edited by … on …" line beneath the banner, sourced from
  `AuditLog`.
- **No nested cards.** Drawer sections are separated by 1px
  hairlines, not by inset cards.

---

# The four flows

Every flow is described in terms of **screens**, the **six states**
(incomplete, current/in-progress, complete, blocked, changes-
requested, verified), and the **empty/loading/error** states.

---

## Flow A — Referrer / Influencer / Partner mobile verification

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

**Goal.** Move the beneficiary from MISSING_INFO to BANK_READY with
the smallest number of decisions per screen.

**Component anchor.** `MobileVerificationWizard` wraps every screen
in this flow.

### Screen A1 — Welcome / "Set up payouts"

- **Eyebrow.** "Payouts"
- **Title.** "Let's get you ready to receive payouts."
- **Body.** Two short paragraphs. The first describes what the
  user will do; the second carries the verbatim Bank-vs-KYC sentence:
  > OKÜ performs beneficiary verification and payout-eligibility
  > checks. Banesco performs formal banking/KYC/AML.
- **Primary CTA (bottom bar).** "Start"
- **Privacy panel.** Collapsed `PrivacyNoticePanel` at the bottom
  with the verbatim notice excerpt and a link to the full notice.
- **States.**
  - *Incomplete (first visit):* CTA reads "Start".
  - *Current (returning, partway):* CTA reads "Continue", with a
    small "Resuming step 2 of 3" caption.
  - *Complete:* CTA reads "View status"; routes to A6.
  - *Blocked / on hold:* `ComplianceHoldBanner` replaces the body;
    CTA reads "Read details".
  - *Changes requested:* amber `AlertStrip` with the typed reason;
    CTA reads "Resume".
  - *Verified (BANK_READY):* green `AlertStrip`, CTA "View status".

### Screen A2 — Bank coordinates

- **Step indicator.** 1 of 3.
- **Title.** "Your Banesco account"
- **Fields (single column).**
  1. Account holder name (text). Helper: "As it appears on the
     Banesco account."
  2. Bank name (default "Banesco", editable).
  3. Account type (radio: Checking / Savings).
  4. Account number (`MaskedSensitiveField`, edit mode shows clear
     digits while typing, blurs to `•••• 1234`). Helper:
     "Encrypted on save. Only the last 4 digits will appear later."
  5. Currency (default USD).
  6. SWIFT/BIC (optional).
- **Inline errors.** Per-field, beneath input.
- **Primary CTA.** "Continue"
- **Bank-vs-KYC sentence** appears once beneath the form, small,
  neutral colour.
- **States.** Same six. Blocked/on-hold demote the screen to
  read-only with a banner; verified shows the masked summary
  instead of inputs.

### Screen A3 — Documents

- **Step indicator.** 2 of 3.
- **Title.** "Documents"
- **Body.** "We use these to confirm your identity and address with
  Banesco. **OKÜ performs beneficiary verification and payout-
  eligibility checks. Banesco performs formal banking/KYC/AML.**"
- **Doc rows** (one per `BeneficiaryDocumentType`). Each row has:
  - Doc name + small helper.
  - Status pill (Missing / Received / Verified / Rejected /
    Not required).
  - Action: "Upload" or "Replace" or "View".
  - Upload action opens a full-screen sheet with file picker;
    progress bar; PENDING badge after upload until scan completes.
- **Primary CTA.** "Continue" (enabled once required docs are
  Received or Verified, per `isInfoComplete`).
- **Inline error.** "This file type isn't allowed (PDF, JPG, PNG,
  WebP only)."
- **States.** Same six. Rejected docs render in red with the
  verbatim rejection reason and a "Replace" action.

### Screen A4 — Review

- **Step indicator.** 3 of 3.
- **Title.** "Review and submit"
- **Body.** A summary of fields (masked) and doc statuses.
- **Verbatim Bank-vs-KYC sentence.**
- **Primary CTA.** "Submit for review"
- **Inline note.** "We'll email you when your status changes. You
  can opt out of informational emails in your account."

### Screen A5 — Submitted (READY_FOR_REVIEW)

- **Title.** "We've got it from here."
- **Body.** "OKÜ Finance will review within 2 business days. We'll
  email you when your status changes. **OKÜ performs beneficiary
  verification and payout-eligibility checks. Banesco performs
  formal banking/KYC/AML.**"
- **Primary CTA.** "Back to dashboard"
- **Status block.** Green `BeneficiaryStatusPill` reading "Ready
  for review".

### Screen A6 — Status (long-running, until BANK_READY)

- `VerificationStepper` (vertical, 5 steps): Submitted → OKÜ
  approval → Sent to Banesco → Banesco confirmation → Bank-ready.
  Current step is filled; past steps are check-marked; future
  steps are outlined.
- `PayoutEligibilityStatus` card beneath the stepper: "Eligible"
  (green) or "Blocked" (amber/red) with single-line reason.
- "What happens next?" expandable section with EN microcopy
  (see §Microcopy).
- **Verbatim Bank-vs-KYC sentence.**
- **Primary CTA.** "Edit your bank info" → returns to A2 with a
  warning that editing will reset OKÜ approval (per
  `applyAutoStatusTransitions`).

### Empty / loading / error (Flow A)

- **Empty.** First visit: warm welcome card; no negative framing.
- **Loading.** Skeleton rows for the form fields; stepper shows
  pulse on the current step. No spinner overlays.
- **Error (network).** Inline `AlertStrip` at top of the screen
  with retry link. Form data preserved locally.
- **Error (validation).** Inline-under-field, per the canonical
  rule.
- **Error (encryption unavailable, `APP_ENCRYPTION_KEY` missing).**
  Account-number field is disabled with the inline message:
  "Bank account saving is temporarily unavailable. Please try
  again later." (Operator-side: a SUPERADMIN gets a separate
  banner on `/admin/payouts/beneficiaries`.)

---

## Flow B — Admin Finance / Superadmin desktop review

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

**Goal.** A focused queue + drawer workflow for ADMIN_FINANCE and
SUPERADMIN to review, approve, request changes, hold, or reject
beneficiaries — with every restricted-data view audited.

**Component anchor.** `FinanceReviewDrawer` wraps every drawer in
this flow.

### Screen B1 — Beneficiary queue (`/admin/payouts/beneficiaries`)

- **AdminPageShell.**
  - *eyebrow:* "Payouts"
  - *title:* "Beneficiaries"
  - *kpiRow:* counts of "Awaiting review", "OKÜ approved",
    "Awaiting Banesco", "Bank-ready", "On hold", "Rejected".
  - *filterBar:* status (multi-select), search (name/email),
    date range, role (Influencer / Partner / Referrer).
  - *actions:* "Export queue (CSV — counts only, no detail)" —
    audited as `compliance.export.beneficiary_queue`.
- **Table columns.** Display name · Role · Status pill (`StatusChip`)
  · Last updated · "View" (opens drawer).
- **Permission gate.** Summary view requires
  `admin:beneficiaries:summary`; drawer requires
  `admin:beneficiaries:detail` (per phase (b)). Users with summary
  only see the queue; the "View" link is replaced by "Restricted —
  request access" copy.

### Screen B2 — Detail drawer

- **`SlideOverPanel`** opens from the right.
- **Top of drawer (always pinned).**
  - `RestrictedDataBanner`:
    > Restricted compliance data — access is logged.
  - Audit ribbon (single line): "Last viewed by … on … · Last
    edited by … on …".
- **Body sections (separated by 1px hairlines, no nested cards).**
  1. **Status.** `BeneficiaryStatusPill` + the four orthogonal
     timestamps (OKÜ approved at, Bank-ready at, etc.) +
     compliance hold reason if present.
  2. **Bank info.** `MaskedSensitiveField` for the account
     number (last-4 only; "Replace" action allowed; no reveal of
     full digits — by design, see Risky areas in the gap doc).
     Bank name, holder name, type, currency, SWIFT.
  3. **Documents.** Per `BeneficiaryDocumentType`: filename,
     scan status pill, doc status pill, "View" (signed URL,
     audited as `admin.beneficiary.document.viewed`),
     admin-only "Mark verified / rejected / not required".
  4. **Notes.** `adminVerificationNotes` (free text). Helper:
     "Do not paste account numbers or full ID numbers — use the
     structured fields above."
  5. **Verbatim Bank-vs-KYC sentence**, small, neutral colour.
- **Drawer footer (sticky).**
  - Three primary actions: "Approve", "Request changes", "Hold".
  - One destructive action: "Reject" (text link, red).
  - "Approve" disabled until `isInfoComplete` and no compliance
    hold; tooltip lists missing checks.
  - "Request changes" / "Hold" / "Reject" each open the
    reason-required modal.
- **States.** Drawer renders the six states verbatim:
  - *Incomplete:* "Approve" disabled; missing-fields tooltip.
  - *Current (READY_FOR_REVIEW):* full action set enabled.
  - *Complete (OKU_APPROVED):* "Approve" hidden; "Send to bank"
    visible (a no-op state hint, since transition to
    AWAITING_BANK_CONFIRMATION is currently manual).
  - *Blocked (ON_HOLD):* hold banner red; "Lift hold" action
    visible (with reason-required modal).
  - *Changes requested:* amber banner with the typed reason;
    "Mark resolved" action.
  - *Verified (BANK_READY):* green banner; only "Hold" / "Reject"
    actions remain.

### Screen B3 — Reason-required modal

- **Title.** "Request changes" / "Place on hold" / "Reject
  beneficiary"
- **Body.** A 200–500-char textarea labelled "Reason (will be
  emailed to the beneficiary)".
- **Helper.** "Use plain language. Do not paste account numbers or
  full ID numbers."
- **Cancel.** Text link.
- **Primary.** "Confirm" — disabled until ≥10 chars.
- **On confirm.** State transition + email + AuditLog row + drawer
  refresh; toast: "Beneficiary updated. Action logged."

### Empty / loading / error (Flow B)

- **Empty queue.** "No beneficiaries match these filters." Reset
  link.
- **Loading drawer.** Skeleton rows; banner renders immediately
  so the audit guarantee is visible during load.
- **Error.** `AlertStrip` at the top of the drawer with the
  scrubbed error message; never the raw stack.

---

## Flow C — Payout batch trust flow

> OKÜ performs beneficiary verification and payout-eligibility checks.
> Banesco performs formal banking/KYC/AML.

**Goal.** Make the maker/checker workflow legible and surface
beneficiary-readiness blockers as the *primary* fact, not a
side note.

### Screen C1 — Batches list (`PayoutBatchesPanel`)

- Status pills: Draft · Pending approval · Approved · Exported ·
  Rejected.
- "Bank-readiness blocker count" column on each row, e.g.
  "3 blocked". Click → batch detail with blocked rows pre-filtered.

### Screen C2 — Batch detail drawer

- **Top of drawer.** `RestrictedDataBanner`. Audit ribbon.
- **Section: Eligibility.**
  - For each ledger row, `PayoutEligibilityStatus` shows
    Eligible / Blocked + the single-line reason
    (`BENEFICIARY_PROFILE_MISSING` / `BANK_NOT_READY` /
    `COMPLIANCE_HOLD`).
  - Each blocked row has a "Why is this blocked?" deep link →
    opens the beneficiary detail drawer (Flow B), preserving the
    payout-batch context.
- **Verbatim Bank-vs-KYC sentence** appears in the section header
  whenever any row is blocked by readiness.
- **Footer.**
  - Maker actions: "Submit for approval" (disabled until 0
    blockers).
  - Checker actions: "Approve" / "Reject" (each requires reason
    if rejecting).
  - "Export bank file" — only after Approved. Opens the export
    modal (Screen C3).

### Screen C3 — Export modal

- **Title.** "Export Banesco bank file"
- **Body.** A summary line ("12 rows, $X total, exporting now") +
  the verbatim Banesco caveat:
  > Banesco bulk-payment export may introduce additional required
  > fields. Any new field required by Banesco must be classified
  > before implementation and must not be added directly to
  > exports without privacy review.
- **Field list preview.** Read-only list of fields that will be
  exported (allowlist, no row dump).
- **Confirm.** "Export" — audited as
  `compliance.export.beneficiary_bank_file`.

### Empty / loading / error (Flow C)

- **Empty.** "No batches yet." CTA "Create draft".
- **Loading.** Skeleton rows; eligibility pills render as
  outlined chips until resolved.
- **Error.** "Eligibility check failed" — refuses to enable the
  export button.

---

## Flow D — Privacy / Compliance admin

`[Official]` for the lawful basis the surfaces serve;
`[Internal inference]` for the UX shape.

### Screen D1 — `/admin/privacy/audit` (phase (a))

- **AdminPageShell.** *title:* "Sensitive-access audit".
- **Filter bar.** Actor · Target user · Action · Date range.
- **Table.** Read-only rows from `AuditLog` filtered to the
  privacy/compliance event taxonomy. CSV export of counts only,
  no metadata bodies, audited.

### Screen D2 — `/admin/privacy/requests` (phase (d))

- **Queue.** New · In progress · Completed · Overdue.
- **KPI row.** Open count · Overdue count (per Law 81 deadlines)
  `[Official]` · 30-day average response time.
- **Drawer.** Subject identity (masked), type of right (access /
  rectification / erasure / portability / objection / consent
  withdrawal / restriction), narrative, files exchanged
  (allowlisted types, AV scanned), status transitions with typed
  reasons.

### Screen D3 — `/admin/privacy/vendors` (phase (e))

- **Queue.** Per-vendor row: name, category, country, transfer
  basis (per `cross-border-transfers.md` — the doc remains the
  source of truth) `[Internal inference]`.
- **Drawer.** Vendor detail; link to the relevant section of
  `cross-border-transfers.md`; AI-handling flag (drives the
  guard in phase (i)).

### Screen D4 — `/admin/privacy/retention` (phase (f))

- Read-only table sourced from `data-classification.md`. Per
  category: retention window, sweeper status, last sweep at, next
  scheduled sweep. No write actions in this phase.

### Empty / loading / error (Flow D)

- Same patterns as Flow B.

---

# The ten primitive components — UX specs

For each: purpose, inputs/props (described in plain language), states,
mobile vs. desktop variants, accessibility, and reuse notes.

## 1. `TrustCard`

- **Purpose.** Surface the user's payout-trust status on dashboards
  (Influencer, Partner, Referrer, public earner).
- **Props (described).** Status (verified / pending / blocked /
  changes-requested / on-hold / verified-but-no-payout-yet);
  primary message; secondary message; CTA label + href; whether to
  show the verbatim Bank-vs-KYC sentence (default: yes for
  beneficiary-touching surfaces).
- **States.** All six. Status drives accent colour (green/amber/red
  + neutral).
- **Mobile.** Full-width, 24px padding, sticky-bottom-bar friendly.
- **Desktop.** Embedded in a 1-column dashboard cell or a 2-column
  grid; same shape.
- **Accessibility.** Status announced by the leading
  `BeneficiaryStatusPill`; the card is a single landmark region.
- **Reuse.** Wraps `PrimaryPanel` + `BeneficiaryStatusPill`.

## 2. `VerificationStepper`

- **Purpose.** Show the 5-step beneficiary journey vertically on
  mobile (Submitted → OKÜ approval → Sent to Banesco → Banesco
  confirmation → Bank-ready).
- **Props.** Current step index; per-step state (past / current /
  future); per-step optional caption (e.g. "approved on 12 May").
- **Mobile.** Vertical stack; each step is a row with a 24px circle
  + label + caption.
- **Desktop.** Horizontal pill row across the top of the
  beneficiary detail drawer.
- **Accessibility.** Each step is `aria-current="step"` when
  current; visited steps have screen-reader text "completed".
- **Reuse.** New primitive; thin styling on top of existing tokens.

## 3. `MaskedSensitiveField`

- **Purpose.** The single way sensitive values reach the UI.
- **Props.** Last-4 string (read mode); placeholder; allow-edit
  flag; on-edit submit handler (replaces the value, never
  appends); aria-label override; lock-icon visible (default true).
- **Read mode.** `•••• 1234` with the lock icon.
- **Edit mode (mobile).** Full-screen sheet with cleartext input
  visible while typing; "Save" replaces the value; on success the
  display reverts to last-4 only.
- **Edit mode (desktop).** Inline input replaces the masked
  display; "Save" / "Cancel" buttons.
- **Accessibility.** Read mode `aria-label="Account number ending
  in 1 2 3 4"`; edit mode announces "Sensitive — replacing the
  saved value".
- **Reuse.** New primitive; do **not** copy this pattern into
  bespoke fields.

## 4. `PayoutEligibilityStatus`

- **Purpose.** Single-line "Eligible / Blocked" verdict with one
  primary reason, derived from `evaluatePayoutReadiness`.
- **Props.** Ready (boolean); status; primaryBlockingReason
  (single string); optional CTA ("Why is this blocked?" link).
- **Mobile.** Stacked pill + reason.
- **Desktop.** Inline pill + reason on the same line.
- **Accessibility.** Single live region for the status update.
- **Reuse.** Wraps `BeneficiaryStatusPill` + `AlertStrip` for the
  blocked case.

## 5. `RestrictedDataBanner`

- **Purpose.** The pinned "Restricted compliance data — access is
  logged" banner.
- **Props.** None (text is canonical).
- **States.** Static; never dismissable.
- **Mobile.** Full-width sticky strip below the page header.
- **Desktop.** Pinned at the top of `SlideOverPanel`.
- **Accessibility.** `role="status"`; lock icon has
  `aria-hidden="true"` (text is the source of truth).
- **Reuse.** Thin wrapper around `AlertStrip`.

## 6. `FinanceReviewDrawer`

- **Purpose.** The desktop drawer for Flow B.
- **Props.** Beneficiary id; on-action handlers; permission
  level (`summary` vs. `detail`).
- **States.** All six per Flow B.
- **Mobile.** Falls back to a full-screen sheet (admin desktop
  is the primary surface, but mobile must not crash).
- **Accessibility.** Focus trap inside the drawer; first focus
  on the close button; Esc closes; tab cycle bounded.
- **Reuse.** Wraps `SlideOverPanel`, `RestrictedDataBanner`,
  audit ribbon, `MaskedSensitiveField`, and the reason modal.

## 7. `ComplianceHoldBanner`

- **Purpose.** Beneficiary-facing red banner explaining the hold.
- **Props.** Reason (free text); contact href.
- **Mobile.** Full-width, top of `MobileVerificationWizard`.
- **Desktop.** Top of the dashboard `TrustCard` and inside the
  beneficiary's own `/my/beneficiary` page.
- **Accessibility.** `role="alert"` on first render; subsequent
  renders downgrade to `role="status"` so it does not re-announce
  on every navigation.
- **Reuse.** Thin wrapper around `AlertStrip`.

## 8. `BeneficiaryStatusPill`

- **Purpose.** Canonical status pill across every surface.
- **Props.** Status (`MISSING_INFO` … `BANK_READY` |
  `REJECTED` | `ON_HOLD`).
- **Reuse.** Wraps `StatusChip`. Maps the seven statuses to
  three semantic colours plus neutral. Do **not** invent a
  parallel pill.

## 9. `MobileVerificationWizard`

- **Purpose.** The Flow A container.
- **Props.** Current step; per-step children; on-back / on-next
  handlers; whether the step has unsaved changes (drives "Are
  you sure?" on back).
- **States.** All six.
- **Mobile.** Full-screen, sticky bottom CTA bar, top step
  indicator.
- **Desktop.** Constrained to 480px wide on a centered column
  (the mobile shape is the canonical one — desktop just
  preserves it).
- **Accessibility.** Step indicator has `aria-current="step"`;
  bottom CTA has 44px target.
- **Reuse.** New primitive; composes `VerificationStepper`,
  `MaskedSensitiveField`, `PrivacyNoticePanel`.

## 10. `PrivacyNoticePanel`

- **Purpose.** Reusable collapsed/expanded notice excerpt + link
  to full notice.
- **Props.** Surface key (drives which notice section to load,
  e.g. `beneficiary` / `newsletter` / `hiring` / `reservation` /
  `checkout` / `dashboard`); locale (defaults to user locale);
  collapsed-by-default flag (default true).
- **Body.** Two-line summary; "Read full privacy notice" link
  → footer privacy page; "Last updated" date.
- **Mobile.** Full-width below the form. Tap to expand.
- **Desktop.** Same shape; expand is inline.
- **Accessibility.** `<details>`-style disclosure; expand state
  is announced.
- **Reuse.** Wraps `PrimaryPanel`. Pulls copy from a new `privacy`
  i18n namespace.

---

# Accessibility (canonical for every surface)

`[Internal inference]`

- **Touch targets.** ≥44×44px on mobile; ≥32×32px on desktop.
- **Contrast.** Body text ≥ 4.5:1; status pills ≥ 3:1 against
  card background.
- **Focus order.** Logical top-to-bottom; sticky bottom CTA is
  reachable via Tab from the last form field, never skipped.
- **Focus rings.** Visible 2px ring in the OKÜ accent on focus;
  never `outline: none`.
- **Screen-reader labels for masked fields.** "Account number
  ending in 1 2 3 4" — digits spaced so VoiceOver/TalkBack
  reads each digit. Edit mode announces "Sensitive — replacing
  the saved value."
- **Status changes.** Single live region (`role="status"`) per
  surface; status pill changes are announced once.
- **Errors.** Each inline error has `aria-describedby` linking
  the field to its message. The word "Error:" prefix is
  preserved in the screen-reader-only label.
- **Reduced motion.** Respect `prefers-reduced-motion` — drawers
  and step transitions snap instead of slide.
- **Language.** Each surface declares its language attribute
  from the user's preferred locale (EN / ES / PT) so screen
  readers pronounce correctly.

---

# Trust microcopy drafts (EN)

`[Internal inference]`. Final ES / PT translations are a follow-on
task (out of scope per #98). Every beneficiary-touching surface
includes the verbatim Bank-vs-KYC sentence; every export modal
includes the verbatim Banesco caveat.

## Footer privacy link (phase c-1)

- Link label: "Privacy notice".
- Notice page eyebrow: "Privacy".
- Notice page title: "How we handle your information".
- First-paragraph hook: "We're a hospitality group. We try to
  hold the smallest amount of personal data we can — and to be
  clear about what we do hold."

## Newsletter signup widget (phase c-2)

- Above the email input: "We'll send occasional notes about
  events and openings."
- Beneath the submit button (collapsed `PrivacyNoticePanel`):
  "We use Resend to deliver email. You can unsubscribe at any
  time from any newsletter footer. **Read full privacy notice.**"

## Hiring `data_consent` widget (phase c-3)

- Checkbox label: "I agree OKÜ may use my application materials
  to consider me for current and future roles."
- Helper: "We keep applications for 12 months unless you ask us
  to delete them sooner. **Read full privacy notice.**"

## Reservation form final step (phase c-4)

- Above the confirm button: "By confirming, you allow OKÜ and
  the venue to contact you about this reservation."
- `PrivacyNoticePanel` collapsed: "We share the reservation with
  the venue's hosting team. We do not share your contact info
  with anyone else. **Read full privacy notice.**"

## Checkout — payment step (phase c-5)

- Above the pay button: "Your card details are handled by our
  payment processor. OKÜ never sees your full card number."
- `PrivacyNoticePanel` collapsed: "We use Cybersource to take
  payments in Panama. **Read full privacy notice.**"

## Beneficiary form `/my/beneficiary` (phase c-6)

- Page intro: "These details let us pay you. **OKÜ performs
  beneficiary verification and payout-eligibility checks.
  Banesco performs formal banking/KYC/AML.**"
- Account-number helper: "Encrypted on save. Only the last 4
  digits will appear later."
- Notes placeholder: "Optional. Don't paste account numbers
  here."
- Email opt-out: "Send me only action-required emails."
  (Default unchecked. Action-required emails are always sent.)

## Admin BeneficiariesPanel drawer banner (phase c-7)

- Banner: "Restricted compliance data — access is logged."
- Audit ribbon: "Last viewed by {name} on {date} · last edited
  by {name} on {date}".
- Bank-vs-KYC sentence beneath the bank section: "**OKÜ
  performs beneficiary verification and payout-eligibility
  checks. Banesco performs formal banking/KYC/AML.**"

## Payout batch export modal (phase c-8)

- Title: "Export Banesco bank file"
- Body: "Exporting {n} rows totalling {amount}. **Banesco
  bulk-payment export may introduce additional required fields.
  Any new field required by Banesco must be classified before
  implementation and must not be added directly to exports
  without privacy review.**"
- Confirm button: "Export"

## Referrer dashboard payout-trust card (phase c-9)

- Title: "Payouts"
- Status line: "{Eligible | Blocked | On hold | Awaiting
  Banesco}".
- One-liner explanation per state. Bank-vs-KYC sentence beneath.
- CTA: "Manage your bank info" → `/my/beneficiary`.

## Influencer dashboard (phase c-10)

- Same `TrustCard` shape as referrer; copy says "your
  influencer payouts".

## Partner dashboard (phase c-11)

- Same `TrustCard` shape; copy says "your partner share
  payouts".

## On-hold banner (every beneficiary surface)

- "Your beneficiary profile is on hold. Reason: {typed reason}.
  Please reply to the email we sent, or contact us at
  {payouts@oku.group}. **OKÜ performs beneficiary verification
  and payout-eligibility checks. Banesco performs formal
  banking/KYC/AML.**"

## Changes-requested banner

- "We need a couple of edits before approving. Reason: {typed
  reason}. Tap **Resume** to update."

## Verified banner

- "Bank-ready. You'll receive payouts on the next cycle. **OKÜ
  performs beneficiary verification and payout-eligibility
  checks. Banesco performs formal banking/KYC/AML.**"

## Encryption-unavailable banner (operator-side)

- "Bank account saving is temporarily unavailable. Contact the
  on-call engineer to restore the encryption key." (Beneficiary
  side reads only the friendly message in §A.)

---

# Cross-doc map

- Functionality + security gap → `privacy-functionality-gap-assessment.md`.
- Mergeable task breakdown → `privacy-implementation-task-plan.md`.
- Legal/regulatory layer → `panama-law-81-audit.md`,
  `lawful-basis-matrix.md`, `data-classification.md`,
  `cross-border-transfers.md`, `compliance-roadmap.md` (#97).
