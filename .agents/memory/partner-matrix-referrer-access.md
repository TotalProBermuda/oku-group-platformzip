---
name: Partner Matrix referrer access
description: How Partner Matrix partners, sellers, and legacy accounts reach the shared referrer dashboard.
---

Partner Matrix partners, sellers, and referrers use the shared **Referrer Dashboard**. Access and QR visibility must recognize an active linked referral identity, not only JWT roles.

**Why:** Historical Matrix accounts can have only the ATTENDEE role even though they have a provisioned commerce seat, an active ReferralActor, and an active ReferralLink. Role-only navigation labels them “My Account” and blocks their valid QR.

**How to apply:** Preserve admin, host, and influencer dashboard precedence. For other signed-in users, resolve an active direct or admin-approved referral identity server-side. Keep middleware admission separate from final layout/API identity authorization, and never admit suspended actors or inactive legacy referrers.