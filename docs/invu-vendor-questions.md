# Memo to INVU — API integration clarifications required for OKÜ cutover

**To:** INVU Integrations Engineering
**From:** OKÜ Hospitality Group — Platform / POS Integration squad
**Subject:** Nine outstanding integration questions blocking our `citas/add` cutover and satellite-read activation
**Status:** Action requested. We are blocked on items 1–4. Items 5–9 are needed before we move to production volume.

---

## Context (one paragraph)

We have built and verified the OKÜ side of the reservation-to-POS attribution loop end-to-end against your public documentation. Authentication (`POST /invuApiPos/userAuth`) and the closed-orders read (`GET …?r=citas/ordenesAllAdv/fini/{epoch}/ffin/{epoch}/tipo/1/grouping/1`) are live in production code paths and verified against your sandbox. The remaining work — wiring `citas/add` to write our booking reference back into your order record, and consuming the four "satellite" endpoints (invoice totals, payments, credit notes, order totals) — is gated on the nine clarifications below. Each item names the specific decision on our side that your answer unblocks, so you can prioritise responses accordingly.

---

## 1. Complete `citas/add` body schema

**Endpoint:** `POST https://api6.invupos.com/invuApiPos/index.php?r=citas/add`

The vendor docs list the body fields:

```
cliente, descripcion, cerrar_orden, invitados, pagos, comentario,
num_cita, items, id_tipo_integracion, tipo_orden_obj
```

We need the following clarifications **per field**:

| Question                             | Why it matters for OKÜ                                                                                            |
|--------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| Required vs optional flags           | Today we only intend to send `num_cita`, `comentario`, `descripcion`, `cliente`, and `invitados`. Will the call reject if `items` / `pagos` / `tipo_orden_obj` are omitted at order-open time? |
| Maximum length per field             | Specifically `num_cita`, `comentario`, `descripcion`. Our planned `comentario` payload is the trust string `OKU\|RES:{cuid}\|BOOK:OKU-YYYY-XXXXXXXX\|TS:{cuid}\|REF:{code}\|EARNER:{type}` which can reach ~120 characters; please confirm it will not be silently truncated. |
| Character encoding                   | UTF-8? ASCII-safe only? Are pipe (`\|`), colon (`:`), hyphen (`-`), and Spanish accented characters in `descripcion` safe to send? |
| Reserved values                      | Are there reserved or magic strings on `num_cita` (e.g. starting with a digit, leading zeros, prefixes) that would alter behaviour? |
| Behaviour with unknown fields        | If we send a field name not in the schema (forward-compat), is it silently dropped, echoed back, or does the call reject? |
| Behaviour with malformed body        | What is the error contract — HTTP status, JSON envelope, error code field? |
| Idempotency                          | Is there an idempotency key parameter we can include, or must we treat every `citas/add` call as create-only? (See item 8 for the duplicate-write question.) |

**Decision this unblocks on our side:** the final shape of `writeReferenceToInvu` (`src/server/services/invu/invuReferenceWriter.ts`) and the safe maximum length policy in our trust-string builder. Until confirmed we cannot flip our `INVU_REFERENCE_WRITE_ENABLED` feature flag.

---

## 2. URLs for the four satellite endpoints

We have four no-op stubs in our integration client (`src/lib/invu/client.ts`) because the public documentation does not publish the URLs. Please confirm or provide the production URL pattern for each:

| Stub function (our side) | Documented in vendor brief as           | Confirmed URL needed |
|--------------------------|-----------------------------------------|----------------------|
| `getOrderTotals`         | `citas/totalporfecha`                   | `?r=citas/totalporfecha/fini/{epoch}/ffin/{epoch}` — please confirm |
| `getInvoiceTotals`       | `citas/OrdenesAllTotales`               | `?r=citas/OrdenesAllTotales/fini/{epoch}/ffin/{epoch}/tipo/{0\|1\|2\|3\|4}` — please confirm |
| `getPayments`            | `citas/TotalesPagosFechas`              | `?r=citas/TotalesPagosFechas/fini/{epoch}/ffin/{epoch}` — please confirm |
| `getCreditNotes`         | `citas/ordenesAllAdv` with `tipo=2,4`   | Is this the correct way to enumerate complete (`tipo=2`) and partial (`tipo=4`) credit notes, or is there a dedicated endpoint? |

For each, please also confirm:
- Maximum date-range window (the public docs say one month for `ordenesAllAdv` — same for these?).
- Whether dates are Unix-epoch seconds (consistent with `ordenesAllAdv`).
- Response envelope shape (we have inferred shape from `ordenesAllAdv`; please confirm the satellite endpoints return the same envelope).
- Whether they are branch-scoped by the auth user (consistent with `ordenesAllAdv`).

**Decision this unblocks:** replacing four `return [];` stubs with real `callInvuList(...)` bodies. Until done we cannot detect post-hoc voids, split payments, or credit-note reversals reliably; we are currently inferring those from order-level `total` regressions on the next sync tick.

---

## 3. Webhook subscription model and delivery guarantees

The public docs do not describe a push channel. Please clarify:

| Question                                       | Detail required                                                                                  |
|------------------------------------------------|--------------------------------------------------------------------------------------------------|
| Are webhooks supported?                        | Yes / no / private-only / on the roadmap?                                                        |
| Subscription mechanism                         | Self-service in admin? API call? Per-branch only? Per integration token?                         |
| Event catalogue                                | Specifically: `order.opened`, `order.closed`, `creditnote.created`, `creditnote.partial`, `table.opened`, `table.freed`, `payment.applied`. Which exist? |
| Delivery semantics                             | At-least-once vs at-most-once? Ordered per-order or best-effort?                                 |
| Retry policy                                   | Backoff schedule, max attempts, dead-letter behaviour.                                           |
| Idempotency                                    | Is there a stable event id we can de-duplicate on?                                               |
| Signature scheme                               | HMAC algorithm + header name + secret rotation procedure.                                        |
| Payload contract                               | Sample payloads for each event type.                                                             |
| SLA / observed latency                         | Median + p95 from real event to delivery.                                                        |

**Decision this unblocks:** whether we can deprecate our 15-minute polling tick (`worker/jobs/invu-sync.ts`) and respond to closed orders in seconds rather than minutes. Without webhooks we cannot reduce `INVU close → commission minted` latency below the current ~15 min.

---

## 4. Table / `mesa` API (open, occupied, freed)

INVU's product clearly supports table layout, table-linked order creation, and table service mode (visible in the help docs that describe creating an order "by table selection"). The public API docs do not expose this. Please confirm or provide:

| Capability                                                | Specific question                                                                            |
|-----------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Read table layout                                          | Endpoint to list all tables for a branch with `id`, `label`, `zone`, current status.        |
| Read live table state                                      | Endpoint or webhook for `OPEN` / `OCCUPIED` / `FREED` per table.                            |
| Bind order to table at open                                | Can `citas/add` accept a `mesa_id` (or equivalent) at create-time, or must binding happen via a second call? |
| Bind reservation to table                                  | Is there a reservation entity in INVU we can bind to a table, or is "reservation" purely an OKÜ-side concept? |

**Decision this unblocks:** removing the human-host gap in our trust loop. Today the restaurant host must manually open the INVU order on the correct table; our `OperationalBinding` row anchors that intent locally. With a real table API we can automate the bind and reach Tier-1 deterministic match without relying on the human.

This is the single most operationally impactful answer — please prioritise.

---

## 5. Reservable `id_tipo_integracion` for OKÜ

We need a stable integer (or string) value reserved for OKÜ-originated orders so we can filter `ordenesAllAdv` to our own writes on the read side and avoid colliding with other integrations.

- What value should we send on `citas/add`?
- Is the value globally reserved, or do we need to reserve a value per branch?
- Are existing values listed anywhere we can avoid?

**Decision this unblocks:** a clean filter on the read path so we do not waste matcher cycles on non-OKÜ orders, and so cross-integration audits stay clean.

---

## 6. Per-branch API user expiry semantics

We were told the API user must be created per branch and that users expire. We currently store `apiUserExpiresAt` on our `InvuIntegrationCredential` row but have no way to populate it programmatically.

| Question                                          | Why                                                                                       |
|---------------------------------------------------|-------------------------------------------------------------------------------------------|
| Default API-user lifetime                          | Hours / days / months from creation?                                                       |
| Programmatic discovery of expiry                   | Is the expiry returned on `userAuth` (we do not see it today), or queryable separately?  |
| Renewal procedure                                  | API call vs vendor admin only? Same credentials or rotated?                               |
| Pre-expiry warning                                 | Do you emit a warning header / response field as expiry approaches?                       |
| Expired-user error contract                        | What HTTP status + body do we receive when calling with an expired user?                  |

**Decision this unblocks:** a scheduled token-rotation job on our side that detects imminent expiry and re-auths automatically. Without this, expiry causes a silent sync-tick failure and the only signal is `lastAuthError` on our credential row.

---

## 7. Attribution retention window for `num_cita`-keyed records

We use `num_cita` as our deterministic lookup key (via `citas/view tipo=0` and via in-line scanning of `ordenesAllAdv` results).

| Question                                                                       |
|--------------------------------------------------------------------------------|
| For how long after order close is a `num_cita`-keyed lookup guaranteed to return a record? |
| Does archival eventually move the record out of `citas/view` reach? If so, after how long?  |
| Are credit notes against archived orders still resolvable by the original `num_cita`?      |
| Is there a separate "archive" or "history" endpoint we should fall through to?              |

**Decision this unblocks:** the upper bound on how long we keep `OperationalBinding` rows on our side (currently indefinite), and the maximum lookback we expose in dispute-resolution UI.

---

## 8. Concurrent-write behaviour on the same `num_cita`

If we call `citas/add` twice with the same `num_cita` (because of a retry, a network blip, a flag flip, or a race between two operators):

| Question                                                                       |
|--------------------------------------------------------------------------------|
| Is the second call rejected, ignored, accepted-and-overwriting, or accepted-and-appending? |
| If rejected, what is the error code so we can detect "already exists" specifically?         |
| Is there a way to UPDATE an existing order's `comentario` / `descripcion` after open? (Patch endpoint?) |
| If overwrite, do prior `pagos` / `items` survive?                                            |

**Decision this unblocks:** the idempotency strategy in `writeReferenceToInvu`. Today we mark `invuReferenceWritten=true` on first success; without confirmed duplicate-write behaviour we cannot safely retry on transient errors without risking duplicate orders or lost references.

---

## 9. Documented rate limits

We need published limits for:

| Limit                                            | Why                                                                       |
|--------------------------------------------------|---------------------------------------------------------------------------|
| Per-token requests per second / per minute       | Drives the safe upper bound on parallel branch-mapping syncs.             |
| Burst allowance                                   | Drives whether we can fan out reads on a single tick or must serialise.   |
| Daily / monthly cap                                | Drives capacity planning when we onboard additional branches.             |
| Behaviour on limit                                | HTTP 429? `Retry-After` header? Silent throttling?                         |

Our current 15-minute master tick with per-mapping cadence (`syncIntervalMinutes`, default 15) is conservative-by-default precisely because limits are unpublished. With documented limits we can:
- safely lower the default cadence,
- safely add on-demand syncs (e.g. operator-triggered "refresh now" for dispute resolution),
- and add automated retries with the right backoff.

---

## Priority order (for your scheduling)

If you can answer in batches, this is the order in which answers most accelerate our cutover:

1. **Items 1, 4** — unblock the largest in-flight engineering work (`citas/add` cutover and the human-host gap).
2. **Items 2, 3** — unblock the next-most-impactful quality improvements (post-hoc void detection and sub-15-min latency).
3. **Items 5, 6, 8** — unblock production hardening (clean filtering, expiry handling, retry safety).
4. **Items 7, 9** — unblock long-horizon planning (retention policies and capacity).

---

## Suggested response format

To minimise round-trips, we propose you reply inline against this same memo, marking each row of each table with **CONFIRMED**, **CORRECTED** (with the correct value), or **NOT SUPPORTED** (with the closest equivalent). For items where the answer is "on the roadmap", a target quarter would be sufficient for our own planning.

Sample payloads, error envelopes, or even pointers to private documentation are welcome.

---

**Single point of contact on our side:** OKÜ Platform / POS Integration squad — please reply-all to this memo so the same engineers who own the integration code see your response directly.

**Deadline ask:** ideally items 1 and 4 within two business weeks; the rest within one month. We can adjust based on your workload — please reply with a realistic ETA on first read.

Thank you.
