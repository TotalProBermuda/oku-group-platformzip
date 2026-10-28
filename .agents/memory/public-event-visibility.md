---
name: Public event visibility
description: Keep public calendar discoverability separate from ticket sale eligibility.
---

Sessions exposed by the public calendar should remain directly readable after they begin or end. This is a visibility rule, not permission to extend sales, change availability, or expose nonpublic series.

**Why:** Calendar browsing includes historical months and ongoing events. The owner approved a narrowly scoped read-only lookup exception after review found that sales-time filters could make visible calendar links return not-found.

**How to apply:** Keep the public-series constraint and series/session ownership checks on event detail lookups. Preserve existing series listing and checkout eligibility rules unless separately authorized.

Public purchase actions must independently require sale eligibility for the displayed session. Missing eligibility or an absent exact session match must never enable a sibling's purchase link.

**Why:** Checkout's existing selection behavior can choose an eligible sibling when a requested session is absent. The owner requires UI-only protection against entering that path from closed-event pages, while leaving checkout rules unchanged.

**How to apply:** Keep event navigation available when sales are closed, but disable purchase actions across cards, calendars, detail heroes and booking sidebars. Use existing status, timing, product and inventory data; recheck time-sensitive links when activated.
