# ProofPay Trust Circle Integration Spec

## Purpose

This spec defines how ProofPay should preserve trust across
restaurants, referrers, app developers, POS systems, ERP systems, tourism
partners, event operators, and payout workflows.

The platform must be read-first, connector-aware, deterministic, auditable, and
safe for finance-adjacent operations.

## Prime Rule

No proof, no payout.

AI recommends. ProofPay Rules calculate. The ProofPay Ledger records. Humans or
configured policies approve sensitive outcomes.

No AI workflow, external app, connector, restaurant user, or developer should be
able to directly create final payout truth without passing through the ProofPay
Ledger, ProofPay Rules, confidence model, and audit trail.

## Platform Layers

### 1. Truth Layer

The ProofPay Ledger is the source of truth. It owns:

- Referrer identities.
- Referral assignments.
- Attribution sessions.
- Offer and campaign references.
- Revenue events.
- Commission rules.
- Payout eligibility.
- Disputes.
- Fraud and risk flags.
- Manual review outcomes.
- Audit logs.

Truth-layer records should be append-only where possible. Corrections should
create new audit entries rather than silently mutating history.

### 2. ProofPay Connect

ProofPay Connect adapts external systems into the canonical event model.

Each connector must declare capability flags:

- Read orders.
- Read payments.
- Read refunds.
- Read table or seating assignment.
- Read guest count.
- Read menu/item/catalog metadata.
- Read customer or guest metadata.
- Receive webhooks.
- Backfill historical events.
- Write metadata.
- Write campaign tags.
- Write order notes.
- Write dispute status.
- Emit outbound webhooks.
- Supports idempotency keys.
- Supports sandbox testing.

Connectors must not imply capabilities that the external provider has not
explicitly granted.

### 3. Workflow Layer

The workflow layer exposes:

- Internal dashboards.
- Partner dashboards.
- Referrer history views.
- Support and dispute tooling.
- APIs.
- Webhooks.
- ProofPay AI recommendations.
- Campaign setup workflows.
- Payout operations workflows.

The workflow layer can request actions. It cannot bypass ledger rules.

## Canonical Event Model

All connector, app, and manual events should normalize into this event set:

- `referral_scanned`
- `session_started`
- `offer_claimed`
- `order_observed`
- `payment_observed`
- `refund_observed`
- `commission_calculated`
- `payout_eligible`
- `payout_blocked`
- `dispute_opened`
- `audit_finalized`

Recommended common fields:

- Event ID.
- Event type.
- Source system.
- Source connector.
- Source record ID.
- Idempotency key.
- Occurred at.
- Received at.
- Restaurant or operator ID.
- Location ID.
- Zone or dining area, if known.
- Table or seating assignment, if known.
- Guest count, if known.
- Referrer ID, if known.
- Referral assignment ID, if known.
- Offer ID, if known.
- Session ID, if known.
- Revenue amount, if applicable.
- Currency.
- Confidence class.
- Raw payload reference.
- Audit trace ID.

## Confidence Classes

Every external or manual event must carry one confidence class:

- `verified_pos_event`
- `partner_reported_event`
- `customer_claimed_event`
- `manual_review_event`
- `estimated_event`

Confidence classes affect payout eligibility.

Default rule:

- Verified POS events can support automatic payout eligibility.
- Partner-reported and customer-claimed events require corroboration or manual
  review before payout.
- Manual-review events must identify the reviewer and reason.
- Estimated events can support analytics but not final payout eligibility unless
  explicitly approved by a platform-controlled rule template.

## ProofPay Connect Access Policy

The platform is read-first.

Read access should be used to observe orders, payments, refunds, timestamps,
locations, zones, table or seating assignments, guest count, offer references,
customer/referral identifiers, and other transaction evidence.

Write access is optional and connector-specific.

Allowed initial write actions:

- Metadata.
- Campaign tags.
- Offer IDs.
- Order notes.
- Dispute status.
- Outbound webhook callbacks.
- Partner-side workflow status.

Restricted write actions:

- Direct payout eligibility changes.
- Direct ledger truth mutation.
- Direct commission outcome changes.
- Accounting record mutation.
- Payment amount mutation.
- Unverified order/payment mutation.

## ProofPay Rules Governance

Commission and attribution logic must be platform-controlled in v1.

Approved rule templates may support:

- Fixed commission per eligible conversion.
- Percentage of eligible revenue.
- Event-specific commission.
- Restaurant-specific commission.
- Tourism partner commission.
- Referrer tier commission.
- Refund clawback.
- Payout hold period.
- Manual review threshold.

Developers and external apps may request rule configurations but may not create
arbitrary commission logic in v1.

Every rule change must create an audit entry with:

- Changed by.
- Changed at.
- Previous rule version.
- New rule version.
- Reason.
- Effective date.

## Reconciliation Requirements

Reconciliation is a first-class product capability.

The platform must expect:

- Delayed webhooks.
- Duplicate webhooks.
- Missing webhooks.
- Backfilled events.
- Split checks.
- Partial payments.
- Tips.
- Service charges.
- Taxes.
- Discounts.
- Refunds.
- Cancellations.
- Offline POS behavior.
- Manual overrides.
- Host-entered table assignments that differ from POS close data.
- Customer disputes.
- Referrer disputes.

Minimum reconciliation behavior:

- Deduplicate by connector record ID and idempotency key.
- Preserve raw source payload references.
- Record every state transition in the audit log.
- Recalculate payout eligibility after refunds and disputes.
- Keep manual overrides visible, attributed, and reviewable.
- Treat host-entered seating data as provisional until POS close evidence is
  received.
- If POS close data contains a table or seating assignment, use it as the
  verified value for attribution, revenue matching, and support review.
- Preserve the original host-entered value and record the POS correction as an
  audited reconciliation event rather than silently replacing history.
- If multiple POS records conflict on table assignment, keep the payout state in
  review until the conflict is resolved by a platform-controlled rule or manual
  review.

## Table And Seating Assignment Policy

Table assignment is operational evidence for matching a guest journey to a
closed order or payment.

In the host workflow, table assignment can be entered manually before or during
service. That value is useful for operations, but it is not final payout
evidence. When ProofPay Connect syncs with the POS at order close, the POS table
or seating assignment should become the verified value if the connector provides
it.

For example, an OKU host may seat a guest while the app table field is blank or
manually entered. If the INVU receipt later shows `Mesa: T-3`, the ledger should
record the POS close evidence, update the verified table assignment to `T-3`,
and retain the host-side value for audit history.

Required behavior:

- Host input is `provisional_table_assignment`.
- POS close data is `verified_table_assignment` when received from an approved
  connector.
- POS close data may correct or override host input for attribution and support
  review.
- The override must create an audit entry with source, timestamp, previous
  value, new value, connector record ID, and raw payload reference.
- Payout eligibility should use the verified table assignment when matching a
  referral session to a closed order.
- If no POS table assignment is available, the host assignment may remain usable
  as lower-confidence evidence subject to the active rule template.

## INVU Connector Candidate Notes

INVU should be treated as a first-priority ProofPay Connect candidate for Panama
because its settings documentation shows configurable integrations, table
identification, table-service behavior, guest-count capture, third-party order
integrations, KDS credentials, loyalty integrations, and order sync settings.

This confirms integration relevance, not final API coverage. Before build,
ProofPay must still confirm endpoint-level access for closed orders, payments,
refunds, table assignments, guest count, timestamps, items, fiscal identifiers,
webhooks, backfills, authentication scope, sandbox access, and rate limits.

Until INVU confirms write permissions, the connector should remain read-first.

## Dispute And Support Path

Support users must be able to answer:

- Who was the referrer?
- What offer or assignment was used?
- When did the referral session start?
- What revenue event was observed?
- Which connector or evidence source supplied it?
- Which commission rule version applied?
- Why was payout eligible or blocked?
- Did refunds, fraud flags, or disputes alter eligibility?
- Who manually reviewed or overrode the outcome?

## Developer Platform Boundary

Developers and app owners are the second-wave platform market.

Initial external API behavior should let developer apps:

- Create referral claims.
- Register app-side referral events.
- Receive webhook notifications.
- Read non-sensitive attribution status.
- Read payout status where authorized.
- Request campaign or offer setup.

Developer apps should not be able to:

- Write verified POS events.
- Mark payouts eligible.
- Override commission outcomes.
- Delete audit history.
- Create arbitrary commission logic.
- Downgrade confidence requirements.

## Test Scenarios

### Referred Restaurant Guest

A restaurant receives a referred guest. The POS payment appears after the visit.
The ledger matches the revenue event to the referral session, calculates
commission using the approved rule template, and marks payout eligible after the
hold period.

### Duplicate Webhook

A payment webhook arrives twice. The connector adapter recognizes the duplicate,
keeps one observed payment event, and records duplicate receipt in the audit
trail without double-counting commission.

### Refund After Commission Calculation

A refund occurs after commission calculation but before payout release. The
ledger recalculates eligibility and blocks or adjusts payout according to the
refund clawback rule.

### Split Check

A referred party splits a check. Only eligible revenue is attributed. Tips,
taxes, service charges, and excluded items follow the active rule template.

### Missing Credit Dispute

A referrer disputes missing credit. Support can review assignment history,
session timestamps, connector evidence, confidence class, rule version, and
outcome explanation.

### POS Table Assignment Correction

A host seats a guest but leaves the app table field blank or enters the wrong
table. At close, the INVU receipt shows the table as `T-3`. ProofPay Connect
syncs the closed order, records `T-3` as the verified table assignment, preserves
the host-entered value, and writes an audit event explaining the correction.
Attribution and support review use the verified POS table value.

### Developer App Referral Claim

A developer app sends a referral claim. The ledger records it as
`partner_reported_event` until POS evidence or manual review raises confidence.

### Read-Only Connector

A connector supports read but not write. The platform ingests transaction
evidence, updates the ledger, calculates eligibility, and emits outbound
webhooks without attempting POS mutation.

### Limited-Write Connector

A connector supports metadata or order-note writes. The platform writes only
approved metadata or workflow status and never writes payout truth into the
external system.

## Acceptance Criteria

The trust circle integration is correctly implemented when:

- The ledger remains the system of record for attribution and payout
  eligibility.
- Every external event carries source, confidence, and audit metadata.
- Connector capabilities are explicit and never assumed.
- Read-only connectors still support the core product.
- Write actions are limited to low-risk workflow operations.
- Commission rules are governed by platform-controlled templates.
- Reconciliation handles delayed, duplicate, partial, refunded, disputed, and
  manually reviewed events.
