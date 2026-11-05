---
name: Generated validation baselines
description: Classifying newly visible generated diagnostics without concealing baseline failures
---

Compare source ancestry as well as generated diagnostic paths when classifying new errors after a production build.

**Why:** Next can emit previously absent page-export checks for unchanged baseline source. A newly visible diagnostic category can expose a genuine old error rather than a feature regression. Counts before and after generation are not directly equivalent.

**How to apply:** Retain exact before/after logs and command exits, trace generated errors to source and compare that source with the base branch. Fix introduced failures; clearly report newly exposed baseline errors. Do not remove generated checks or equate a build that skips types with a passing standalone typecheck.
