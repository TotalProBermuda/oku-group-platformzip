---
name: Next dev chunk cache corruption
description: How to identify an inconsistent Next.js development bundle after branch or build activity.
---

When Next.js development requests fail because generated chunks under `.next/server` cannot be found, while `npm run build` succeeds, treat the development output cache as inconsistent before changing application imports.

**Why:** The dev runtime can retain a webpack manifest that points to stale chunk locations after branch or build activity. This presents as unrelated routes all failing on missing numeric chunks or vendor chunks even though the dependencies are installed and the source compiles.

**How to apply:** Confirm that multiple routes fail on generated `.next` paths, remove only the generated `.next` directory, restart the existing Next.js workflow, and verify the affected page and API routes return successfully.