# Production launch runbook

This runbook is for the production deployment only. Preview and demo environments
may intentionally fail production readiness gates; do not turn a preview into
production by changing its environment variables.

## 1. Deploy the reviewed commit

1. Start from a clean checkout of the exact reviewed commit.
2. Install from the lockfile with `npm ci` and run `npm run build`.
3. Record the commit SHA, deploy time, operator, and intended rollback SHA in
   the deployment record.
4. Deploy first to a staging environment that has a separate database and no
   production payment credentials.
5. Do not promote until the validation checklist below has passed.

## 2. Production configuration

Set these in the production secret manager; never put their values in source,
browser-visible configuration, command arguments, screenshots, or logs.

| Setting | Production requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `DEMO_MODE_ENABLED` | Unset or `false` |
| `DATABASE_URL` | Production database only, least-privilege application account, TLS required |
| `NEXTAUTH_SECRET` | Newly generated, high-entropy value; rotate if ever exposed |
| `NEXTAUTH_URL` | Canonical HTTPS production URL |
| `NEXT_PUBLIC_APP_URL` | Same canonical HTTPS public URL; verify every email/link target |
| `APP_ENCRYPTION_KEY` | Stable, valid production key backed up in the secret manager; changing it can make saved provider credentials undecryptable |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Production Resend account and a verified sender domain |
| `REDIS_URL` | Production Redis endpoint so rate limits and job coordination work across instances |
| Cybersource credential row | Production credentials encrypted in the production database; never a preview credential |

Use a separate production database with no `@oku.local` demo accounts. Retain a
break-glass SUPERADMIN account under a controlled company mailbox, and verify at
least two named humans have emergency access through the normal identity path.

## 3. Payments and webhooks

1. In **Admin → Payments**, set Cybersource to `production` only after the
   production credential test succeeds.
2. Record a new passing connection test immediately before launch and at least
   every 24 hours while launch approval is active. The app's readiness display
   uses its stored test timestamp; a stale pass is not sufficient.
3. Configure the Cybersource notification URL to the production HTTPS endpoint
   and set its signing secret in the production secret manager.
4. Verify the webhook signature check with a provider test event; confirm the
   event is deduplicated and changes the intended payment record exactly once.
5. Perform one controlled, low-value end-to-end payment: checkout, receipt,
   webhook, ledger, refund, and void where the provider allows it. Reconcile
   amounts and transaction references against Cybersource.
6. Do not enable a second checkout gateway during this validation. Authorize.net
   and Banesco readiness entries are informational unless they become active.

## 4. Email, data protection, and recovery

1. Use **Admin → Launch Readiness → Send test alert** to a controlled internal
   recipient. Confirm delivery, sender display, reply path, and the public-link
   hostname.
2. Confirm database backups are encrypted, automated, retained to the agreed
   policy, and monitored for failure.
3. Restore the most recent backup into an isolated, access-restricted test
   database. Record the restore time and verify a read-only admin query works.
4. Confirm object storage backups/lifecycle rules for uploads and exported
   finance files. Test an authorized restore of one non-sensitive test object.
5. Confirm application error reporting alerts an on-call human without sending
   tokens, cookies, payment data, or customer messages to the alert system.

## 5. Security acceptance checks

Run these against staging with test accounts before production promotion:

- An unauthenticated request cannot read host-chat messages.
- A guest cannot submit a host message by choosing `senderRole` in the body.
- A non-host authenticated user cannot list the host queue, create a host
  booking, or modify a chat session.
- A host assigned to Venue A cannot access a Venue B chat session or queue.
- A SUPERADMIN can perform the intended cross-venue operational actions.
- Demo login is unavailable in staging/production when demo mode is off, and
  authentication mutation requests return HTTP 429 once their limit is reached.
- The INVU closed-orders test script and application logs do not print auth
  tokens. This check is mandatory because the script is outside this sparse
  checkout and requires a separate review before release.
- `npm audit --omit=dev` has no accepted critical findings. Any remaining high
  findings must have a documented owner, exposure analysis, mitigation, and
  target date; framework-major upgrades require their own regression release.

## 6. Go/no-go decision

Open **Admin → Launch Readiness**, refresh it, and save a timestamped result.
Every blocking gate must pass. A green configuration page is necessary but does
not replace the payment, authorization, backup-restore, and user-journey tests
above.

The launch approver should sign off only after reviewing: deployed commit SHA,
test evidence, payment reconciliation, email receipt, backup restore evidence,
open dependency risk register, and rollback target.

## 7. Rollback

1. Stop promotion and put checkout into the agreed maintenance/disable state if
   a payment or authorization defect is found.
2. Roll back the application to the recorded prior known-good commit; do not
   roll back database migrations without a migration-specific reversal plan.
3. Re-run the launch-readiness refresh, a login check, and a non-financial
   smoke test after rollback.
4. Preserve logs and payment/provider references for incident review, while
   redacting secrets and customer data.
5. Reopen launch only after the incident owner documents root cause, corrective
   change, test evidence, and approval.
