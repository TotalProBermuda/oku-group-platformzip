# Operating calendar and reservation policy

## Source of truth

The Superadmin **Website Content → Operating calendar** controls regular restaurant service everywhere:

- public restaurant opening-hours displays;
- direct reservation time choices;
- referral/QR reservation time choices; and
- final server-side reservation validation.

Each weekday may be closed or contain up to four non-overlapping shifts (for example lunch and dinner). A dated exception overrides its weekday and may close the restaurant or define special shifts. Times are interpreted in `America/Panama`.

## Events

Published events and ticket sales use their explicit event-session date and time, not the restaurant's recurring service calendar. This lets a Superadmin schedule a private or special event outside normal service. Existing space-occupancy checks remain responsible for preventing a regular reservation from colliding with a blocking event in the same physical space.

## Guardrails

- Open days and special-opening exceptions require at least one shift.
- Shifts cannot overlap.
- Only one exception is allowed per calendar date.
- Closed dates return no selectable reservation times and clear stale selections.
- The reservation API rechecks the calendar; the browser is never authoritative.
- Guest-entered times are converted from Panama local time, never the device timezone.
- Public hours are rendered as vertical rows, including upcoming special hours.

## Deployment compatibility

Older stored website-content records are normalized with the default calendar at read time. Saving the Operating Calendar writes the structured model without requiring a new database column or destructive data migration.
