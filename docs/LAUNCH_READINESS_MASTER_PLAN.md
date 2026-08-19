# OKU Hospitality Group — Master Launch Readiness Plan

## Purpose and operating rule

This is the human launch plan that sits beside the automated **Launch
Readiness** page at `/admin/launch-readiness`. The automated page can only
verify technical signals. A production launch is **GO** only when every
blocking item in this document has an owner, evidence, and a recorded pass.

Do not describe work as "done" unless its state is explicit:

| State | Meaning |
| --- | --- |
| Built | Changed in a local branch only. |
| Pushed | Commit is on GitHub, but not necessarily in `main`. |
| Merged | Commit is in GitHub `main`. |
| Deployed | The production/Replit runtime pulled that `main` commit and restarted successfully. |
| Live-tested | A named person completed the relevant real-browser journey against the deployed build. |

## Canonical business model — launch baseline

| Domain | Canonical name | Launch meaning |
| --- | --- | --- |
| Legal entity | **OKU Group S.A.** | Contracts, invoices, privacy, payments, and legal notices. |
| Trading name | **OKU Hospitality Group** | Customer, staff, marketing, and operational brand. |
| Building | **Gold House / Casa Oro** | The property/address; not a restaurant or operating venue. |
| Operated premises | **Local #5, second floor** | The single operating location and permission/capacity boundary. |
| Food concepts | **OKU** and **CATCH** | Menu and public-brand concepts; neither is an access boundary. |
| Dining spaces | **OKU Dining Room**, **CATCH Dining Room**, **Terrace**, **Private Dining Room** | Physical seating areas inside Local #5. |
| Menus | OKU menu and CATCH menu | Available throughout Local #5, subject only to service-time/item availability. |

Required customer location format:

> OKU Hospitality Group · Local #5, second floor · Gold House / Casa Oro · Casco Viejo, Panama City

## Launch decision owners

| Role | Accountable for | Cannot delegate without naming a replacement |
| --- | --- | --- |
| Launch lead / SUPERADMIN | Final GO/NO-GO, release record, incident decision | Final production approval |
| Restaurant operations lead | Floor map, capacity, tables, menus, service hours, host training | Guest seating and safety sign-off |
| Finance/payments lead | Gateway, refunds, taxes, payout policy, reconciliation | Real-money sign-off |
| Technical lead | Migrations, deployment, rollback, monitoring, security | Production change control |
| Guest communications lead | Email/SMS copy, contact routing, accessibility and privacy language | Customer-facing sign-off |
| Referrer/partner lead | QR/referral attribution, commission rules and support | Referrer launch readiness |

## P0 launch blockers — must close before taking live reservations or payments

### 1. Local #5 identity and reservation assignment

**Risk:** the system currently mixes building, operating location, menu
concept, and dining space. A supervisor attempt to move a reservation can
receive `Forbidden: reservation belongs to a different venue`.

**Required outcome:** a supervisor may assign a booking to any valid dining
space in Local #5. A requested space is a preference; it is not a mandatory
placement. Cross-*operating-location* assignment remains forbidden.

Steps:

1. Create a production data report for every `Venue`, `RestaurantSpace`,
   `Zone`, `RestaurantHostProfile`, table, active reservation, capacity hold,
   series, and event occupancy.
2. Select one canonical operating-location record for Local #5.
3. Verify all four dining spaces, all floor-control host profiles, and all
   active reservations point to that record.
4. Verify the current SUPERADMIN session contains the `SUPERADMIN` role claim
   after a fresh login.
5. Correct the host status and space-assignment authorization checks to use
   the operating location, not a menu concept or requested space.
6. Keep the requested-space value for history; store the supervisor's final
   assigned space separately.
7. Add a migration/backfill with a dry-run report and rollback instructions.
8. Live-test: request Terrace, assign CATCH Dining Room, choose a table,
   confirm, and verify the customer/referrer outcomes.

Evidence required: data report, migration output, one test reservation ID,
before/after audit log, confirmation email, and a screenshot of the host
drawer showing requested versus assigned space.

### 2. Capacity, tables, and events

**Risk:** capacity can be duplicated between zones/spaces; table assignment
is currently a free-text field; a capacity override must never exceed legal
or fire limits.

Required outcome:

- one physical-space source of truth for capacity;
- each table belongs to one physical space;
- joined tables are represented as multiple table assignments, not text;
- the system releases the old hold and acquires the new hold atomically;
- event/private-buyout blocks apply to the affected space or the entire Local
  #5 location;
- a hard capacity, safety, accessibility, or exclusive-event conflict cannot
  be bypassed by a normal supervisor.

Steps:

1. Confirm and photograph the floor plan, every table ID, seats, merge rules,
   accessibility notes, and legal capacity for each space.
2. Choose one model: make `RestaurantSpace` the source of truth and retire or
   strictly map the overlapping `Zone` model.
3. Replace text-only table assignment with a structured reservation-to-table
   assignment model; preserve the display label as an immutable snapshot.
4. Split capacity decisions into hard legal capacity and configurable
   operational/sellable capacity. Only the latter may have a reasoned,
   audited override.
5. Test normal move, joined-table move, concurrent assignment, Terrace
   weather relocation, exclusive event block, Private Dining Room request,
   and cancellation/release.

Evidence required: signed floor-plan inventory, capacity policy, passing
concurrency tests, and a test ledger proving no duplicate active hold.

### 3. Customer reservation state and messaging

**Risk:** a pending request can be described as confirmed, or a later change
can send contradictory customer/referrer communications.

Required state model:

`PENDING_APPROVAL` → `CONFIRMED` → `ARRIVED` → `SEATED` → `COMPLETED`

Steps:

1. Make request acknowledgement copy say **request received — not confirmed**.
2. Send a confirmation only after a host selects final time, final space, and
   valid table/joined-table plan.
3. Ensure one status transition produces at most one customer email and one
   referrer update.
4. When staff change a request, show both values internally. Notify the guest
   if the time or dining space changes; do not expose internal table numbers
   unless this is intentional.
5. Keep referral attribution and commission eligibility unchanged by a space
   move. Commission must follow the configured seated/closed milestone.
6. Test resend, refresh, double-click, retry, failure, cancellation, waitlist,
   no-show, and reassignment cases.

Evidence required: captured pending email, final confirmation email, referrer
activity record, and status/audit timeline for one booking.

### 4. Payments and real money

**Risk:** live bookings can accept payment through the wrong or untested
gateway, or refunds/payouts can become unreconciled.

Steps:

1. On `/admin/launch-readiness`, obtain a passing active-gateway test in the
   production account. The existing Panama rule requires Cybersource to be
   active and selectable.
2. Complete low-value, approved live-mode payment tests only after finance
   authorizes them; record transaction IDs outside public channels.
3. Test success, decline, timeout/webhook retry, duplicate submission,
   cancellation, partial/full refund, and booking/payment state consistency.
4. Confirm deposit rules for the Private Dining Room and any event/ticket
   products.
5. Reconcile gateway totals, platform orders, and the commission ledger.
6. Document the on-call contact and customer support procedure for payment
   disputes.

Evidence required: gateway health screen, controlled transaction/reversal
record, refund proof, reconciliation sign-off, and a tested support script.

### 5. Security, privacy, and access

**Risk:** wrong role claims, public test accounts, insecure secrets, or
over-broad staff access can expose guest data or permit unsafe mutations.

Steps:

1. Confirm every production user, role, and restaurant-host profile; remove
   demo accounts and stale staff access.
2. Scope floor-control permissions to Local #5; keep concept-specific roles
   for content/menu ownership only, not access to physical spaces.
3. Require fresh session verification after role changes.
4. Verify `NEXTAUTH_SECRET`, encryption key, production URLs, database URL,
   and Redis are present only in the correct deployment secrets.
5. Confirm rate limits, authentication failures, audit logs, backups, and
   least-privilege service credentials.
6. Red-team all public reservation, QR, referral, payment, upload, and admin
   endpoints for cross-account and cross-location access.

Evidence required: role-access matrix, security test report, no demo accounts,
secret checklist signed by the technical lead, and restore test result.

## P1 launch-critical workstreams

### 6. Concepts, menus, ordering, and public content

Required outcome: menus are independent of seating; public content makes the
business understandable in one glance.

Steps:

1. Replace public “three restaurants/venues” language with “two culinary
   concepts across four dining spaces at one Local #5 location.”
2. Correct inaccurate descriptions, including “rooftop” if Terrace is not a
   rooftop and any cuisine description that does not match OKU Asian Fusion or
   CATCH gourmet Caribbean.
3. On booking surfaces, replace “venue” with:
   - **Menu interest**: OKU, CATCH, both, or decide later.
   - **Seating preference (optional)**: one of the four spaces.
4. State clearly: “Both menus may be enjoyed throughout the restaurant.”
5. Model menu/service availability independently from space. A temporary item
   or kitchen closure may affect an order without making a dining area invalid.
6. Verify order routing, modifiers, allergies, stock-outs, bills, receipts,
   tax/service-charge rules, and staff kitchen/bar workflows.
7. Test each concept's menu ordered from each of the four spaces.

Evidence required: approved content inventory, menu availability matrix,
sample orders from all spaces, and an operations sign-off.

### 7. Events, series, tickets, and occupancy

Steps:

1. Require a complete series before publication: operational location,
   space/occupancy, session(s), ticket type(s), pricing, capacity, media,
   access rules, refund policy, and named owner.
2. Make event occupancy explicit: a single dining space, multiple spaces, or
   entire Local #5. It must not be inferred from the menu concept.
3. For public events, show a correct public discovery/join path only when a
   visible active ticket exists.
4. For private events, show neutral private-event copy without leaking title,
   guest message, or internal details.
5. Test reservation conflict behaviour before, during setup, event, and reset
   windows; test release/cancellation and re-opening availability.
6. Verify every event has a host escalation plan, check-in process, and
   post-event reconciliation.

Evidence required: one fully tested public event, one private event, occupancy
conflict screenshots, ticket purchase/refund records, and host runbook.

### 8. Referrals, QR, partners, and commissions

Steps:

1. Test every public QR/referral link in a logged-out mobile browser.
2. Verify referral code attribution persists through approval, relocation,
   confirmation, seating, cancellation, and no-show.
3. Confirm referrer-facing statuses use human labels such as “Pending host
   approval,” not internal enum values.
4. Verify commission rules, payable milestone, reversal conditions, payout
   ownership, and statements with finance.
5. Test one taxi, concierge, guide, partner, and influencer journey if each is
   enabled at launch.
6. Give referrers a support contact and a concise explanation of when earnings
   become pending, validated, and paid.

Evidence required: mobile QR recordings, attribution/audit data, commission
calculation examples, and partner/referrer sign-off.

### 9. Email, notifications, and support

Steps:

1. Verify the sender domain, reply-to inbox, SPF/DKIM/DMARC, and monitored
support inbox.
2. Approve templates for request received, confirmation, modification,
   cancellation, waitlist, event ticket, payment receipt, and refund.
3. Test rendering in iOS Mail, Gmail, Outlook, dark mode, and plain text.
4. Ensure emails contain correct name, location, date/time/timezone, party
   size, and status; never leak private-event or internal notes.
5. Write support playbooks for late arrivals, dietary/accessibility needs,
   reservation changes, refunds, lost QR codes, and referral disputes.

Evidence required: approved template pack, inbox monitoring owner, deliverability
check, and support escalation roster.

## P2 operational quality gates

### 10. Performance, reliability, and monitoring

1. Build production artifacts and test the actual production runtime, not only
   Next.js development mode.
2. Test mobile booking over slow mobile data; record first-load and submit
   timings.
3. Configure error tracking, uptime check, database/Redis monitoring, queue
   monitoring, payment webhook alerts, email failure alerts, and backup alerts.
4. Confirm scheduled jobs and any worker process are running in the production
   topology; a Vercel web process cannot safely host a long-lived BullMQ worker.
5. Exercise the incident process: app unavailable, database unavailable,
   gateway unavailable, email unavailable, and queue backlog.

### 11. Accessibility, localisation, and legal review

1. Test keyboard navigation, visible focus, form errors, screen-reader labels,
   contrast, text zoom, and mobile touch targets.
2. Review English, Spanish, and Portuguese customer messages; do not expose
   untranslated internal status names.
3. Confirm Panama business, tax, consumer, privacy, refund, alcohol/service,
   accessibility, and data-retention obligations with qualified local advisers.
4. Publish privacy, terms, cancellation, no-show, refund, and accessibility
   policies with correct legal entity and support contact.

### 12. Training and operating procedures

1. Train hosts on request versus confirmed state, final-space assignment,
   joined tables, overrides, event blocks, weather moves, and escalation.
2. Train servers on concept/menu portability: guests may order either menu in
   any space unless a service-time/item rule says otherwise.
3. Run a full service rehearsal with supervisors, hosts, kitchen, bar,
   referrers, and support.
4. Produce one-page shift cheat sheets and a clear incident contact tree.

## Step-by-step launch sequence

### T-21 to T-14 days — model and data freeze

1. Approve the canonical business model in this document.
2. Inventory production data and identify all conflicting venue/location rows.
3. Build and review the Local #5 normalization migration and rollback plan.
4. Close the reservation reassignment 403 and add regression tests.
5. Freeze unapproved scope additions; route new ideas to post-launch backlog.

### T-14 to T-7 days — integrated staging rehearsal

1. Apply migrations to staging and restore a representative sanitized data set.
2. Execute the end-to-end test matrix: reservation, approval, relocation,
   event conflict, payment, refund, referral, email, check-in, and commission.
3. Resolve every P0 failure; P1 failures need an owner, mitigation, and launch
   lead approval.
4. Perform security/access review and approve customer/legal copy.
5. Train staff and repeat the workflow without technical assistance.

### T-7 to T-2 days — production readiness

1. Create production backup and verify restoration to a separate environment.
2. Apply the approved data normalization plan in a controlled window.
3. Verify launch-readiness dashboard is **GO** and attach evidence for every
   manual gate in this plan.
4. Complete controlled payment and email deliverability tests.
5. Confirm staff accounts, support rota, supplier contacts, menus, service
   hours, table inventory, and event calendar.
6. Declare a release candidate commit; no unrelated changes after this point.

### T-1 day — go/no-go rehearsal

1. Run the exact deployment procedure against a rehearsal environment.
2. Re-run the smoke journeys on iPhone and desktop.
3. Verify logs, alerts, rollback owner, rollback command, and database restore
   contact.
4. Convene the decision owners. Any P0 unresolved item is **NO_GO**.

### Launch day

1. Record baseline commit SHA, migration version, gateway test timestamp, and
   backup timestamp.
2. Merge the approved release; record the merge commit.
3. Pull that commit into Replit/production and restart using the documented
   production command.
4. Confirm migrations, Prisma generation, application startup, worker startup,
   and launch-readiness **GO**.
5. Hard-refresh from a clean browser session and run smoke tests:
   - public reservation;
   - pending approval email;
   - supervisor assigns a different Local #5 space;
   - confirmation email;
   - public event availability;
   - QR/referral attribution;
   - payment only if approved for launch-day testing.
6. Record each test as **Live-tested**, including who ran it, timestamp, URL,
   booking/reference ID, and result.
7. Monitor actively for the first service period. Use a single incident channel
   and a named decision maker.

### T+1, T+7, and T+30

1. Review failed bookings, duplicate communications, capacity discrepancies,
   payment/refund issues, referral attribution, and support tickets.
2. Reconcile operational covers, orders, gateway activity, and commissions.
3. Review staff feedback and update training/runbooks.
4. Turn resolved launch exceptions into automated readiness gates where
   possible.

## Mandatory test matrix

| Journey | Expected result | Severity if it fails |
| --- | --- | --- |
| Guest requests Terrace; supervisor seats CATCH Dining Room | Allowed within Local #5; requested and final space both retained | P0 |
| Guest requests any space; orders OKU and CATCH menu items | Allowed unless a documented service/item rule blocks it | P0 |
| Private Dining Room request | Approval/deposit rules enforced; no accidental auto-confirmation | P0 |
| Large party | Valid joined tables, no table/capacity double-booking | P0 |
| Event blocks Terrace | Alternative spaces work; Terrace is unavailable during block | P0 |
| Event blocks entire Local #5 | No dining reservations accepted in blocked interval | P0 |
| Pending approval request | Customer and referrer see pending, not confirmed | P0 |
| Host confirms | One final confirmation with final time/space; no duplicate email | P0 |
| Referral booking moves spaces | Attribution and commission eligibility remain correct | P0 |
| Payment retry/refund | No double charge; reservation/payment states reconcile | P0 |
| Non-supervisor user opens host actions | Denied without guest-data leak | P0 |
| Same-site mobile booking | Completes without overlay/error; keyboard and touch usable | P1 |

## Go / no-go criteria

**GO requires:**

- Automated launch-readiness dashboard is `GO`.
- All P0 tasks and mandatory test matrix items pass in the deployed runtime.
- Payment, email, database, worker, rollback, monitoring, and support owners
  have supplied evidence.
- Local #5, concept, menu, and dining-space terminology is consistent in the
  booking flow, host console, emails, and public pages.
- No open security/privacy issue with material guest or payment impact.

**Automatic NO-GO:**

- A pending request is ever presented as confirmed.
- A supervisor cannot move a reservation between valid Local #5 spaces.
- Capacity can exceed a legal/safety maximum or duplicate an active hold.
- Payment, refunds, transactional email, database migration, or authentication
  is unverified.
- Demo access, secret leakage, missing backup/rollback, or an unresolved
  critical security finding exists.

## Change-control record

For every launch-related change, add a row to the release record:

| Work item | Owner | Commit/PR | Pushed | Merged | Deployed | Live-tested | Evidence | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Local #5 reservation reassignment |  |  |  |  |  |  |  |  |
| Capacity and structured table assignment |  |  |  |  |  |  |  |  |
| Concepts/menus/content correction |  |  |  |  |  |  |  |  |
| Payments |  |  |  |  |  |  |  |  |
| Email and support |  |  |  |  |  |  |  |  |

## Existing automated controls

Use `/admin/launch-readiness` for the technical evidence already checked by
the app: database reachability/schema, production environment, encryption and
auth secrets, Redis rate limiting, SUPERADMIN presence, demo-user absence,
transactional email, and active payment gateway. It is necessary, but it does
not replace this checklist or a real customer-and-operations rehearsal.
