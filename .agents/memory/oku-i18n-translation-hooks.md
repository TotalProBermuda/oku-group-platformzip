---
name: Two parallel i18n translation hooks in OKÜ/Foodie
description: There are two different useTranslation hooks with different return shapes; picking the wrong one breaks a component silently.
---

This codebase has two separate i18n systems in play for client components:

- `useTranslation` from `@/components/i18n/LocaleProvider` — returns the `t` function directly: `t(namespace, key, vars?)`. Also exports `useLocale()` returning the locale string. Used by `MyReferralsFeed`, `GuestQRPanel`, and the referral console modules.
- `useTranslation` from `@/i18n/useTranslation` — returns `{ t }` (destructured), same `t(namespace, key)` signature. Used by `PayoutTrustSummary`/trust components.

**Why:** they coexist historically; nothing in the type system stops importing the wrong one, and both compile — the failure mode is a runtime "must be used within Provider" error or wrong `t` shape.

**How to apply:** before wiring i18n into a new/wrapped component, check which hook the component (or its sibling components in the same feature area) already imports, rather than assuming. Both resolve nested dotted keys (e.g. `"console.tab.qr"`) the same way — via the namespace JSON's own key nesting, checked structurally by `scripts/check-i18n-parity.mjs` (nested vs. flat dot-key shapes are NOT interchangeable there).
