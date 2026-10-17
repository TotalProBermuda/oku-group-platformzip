---
name: Release dependency gate
description: User-required release security scope and validation of dependency overrides.
---

The release dependency gate must include development dependencies and allow
**no moderate, high or critical findings**. Do not substitute a production-only
audit or the versions already installed in the working editor.

**Why:** The user explicitly required this after cancelling a Publishing build
whose merged release lockfile still reported moderate/high vulnerabilities.
Installed editor dependencies can differ from the actual release lockfile.

**How to apply:** Validate the exact candidate lockfile with a frozen install,
all dependency scopes, focused compatibility tests and an isolated build.
Distinguish release-root results from scans of other nested lockfiles.
Never suppress advisory severities or use a blind forced audit fix.

For overrides, check the regenerated lockfile and actual consumer module
resolution, not only the manifest declaration.

**Why:** npm can retain orphan vulnerable lock entries after an override is
changed, even though its dependency graph labels the package overridden.

**How to apply:** Require a clean frozen installation, actual consumer tests
and the final all-scope audit before calling an override effective.

Committed release lockfiles must use public HTTPS npm registry tarball URLs,
not workspace-only package proxy endpoints.

**Why:** Internal registry hostnames cannot be resolved by GitHub CI or clean
installations outside Replit.

**How to apply:** Inspect newly resolved entries after dependency operations.
Normalize only their location, preserving package versions, integrity hashes
and dependency graph; then verify frozen installation and the all-scope audit.

Keep Wine Down event-data edits out of dependency, translation infrastructure
and release-preparation work.

**Why:** The user manages its live sessions separately and repeatedly required
that release work leave event data untouched.

**How to apply:** Use isolated fixtures for validation. Do not change live
sessions unless the user separately authorizes event-content work.
