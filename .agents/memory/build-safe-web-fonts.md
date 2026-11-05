---
name: Build-safe web fonts
description: Keep production builds independent from Google Fonts availability and response formatting.
---

Do not use `next/font/google` in this project. Load Google font stylesheets in the browser with complete system-font fallbacks, or use committed local font files.

**Why:** A production publish failed inside Next.js's Google font loader when an external response did not match its expected format. The same source built successfully before and afterward, confirming a nondeterministic build-time network dependency.

**How to apply:** Font changes must not require a remote request during `next build`. Verify with a clean build after removing `.next`, then confirm the rendered page still uses the intended typography or a safe fallback.