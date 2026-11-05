# Release lockfile security review

## Scope and result

Base: merged main `4089aafed7890b0927d8d2400b7646427be19a55`.
The root release `package-lock.json`, including production, development,
optional and peer dependencies, was audited in an isolated worktree.

- Before: **17 affected package entries: 8 high, 8 moderate, 1 low**.
- After a frozen `npm ci`: **0 critical, high, moderate, low or informational**.
- The workspace-wide dependency scanner also scans other nested lockfiles.
  Its aggregate count is not the root release-lock count; this change does not
  claim those separate design/snapshot lockfiles have been remediated.
- No `npm audit fix --force`, hosting change, event edit, database write,
  migration execution or publishing operation was performed.
- Existing `next > postcss: 8.5.26` and `sharp: 0.35.5` security settings remain.

## Advisory inventory and dependency chains

These are all 13 distinct advisories returned by the baseline root npm audit.
Inherited vulnerable-package entries account for the total of 17.

| Advisory | npm severity | Affected chain / resolution |
| --- | --- | --- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | High | `eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces <=3.0.3`: remove the unpatched implementation from this chain |
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | Moderate | Vitest / mocker / coverage 4.1.6 → aligned 4.1.12 |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | Moderate | ESLint/TypeScript minimatch chains: brace-expansion 1.1.18 → 1.1.21, 5.0.9 → 5.0.12 |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | High | Same brace-expansion chains and fixes |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | High | Same brace-expansion chains and fixes |
| [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | Low | `tsx > esbuild`: tsx 4.21.0 → 4.23.15, esbuild 0.27.3 → 0.28.2 |
| [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) | Moderate | `eslint > @eslint/eslintrc > js-yaml`: 4.1.1 → 4.3.2 |
| [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) | High | Same js-yaml chain and fix |
| [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | High | Same js-yaml chain and fix |
| [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | High | Same js-yaml chain and fix |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Moderate (OSV: high) | Storage SDK → gaxios 6 / retry-request → teeny-request 9 → uuid 9.0.1: scoped UUID 11.1.1 overrides |
| [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | Moderate | `vitest > vite`: 8.0.13 → 8.0.16 |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | High | Same Vite chain and fix |

Next and its lint preset are aligned at **15.5.28**, without a framework-major
upgrade. Next itself was not an entry in this npm advisory result.

### Narrow compatibility overrides

**Lint glob:** only the Next lint plugin's `fast-glob` dependency is replaced
with `npm:tinyglobby@0.2.17`. This is a different, maintained implementation,
not a renamed copy of vulnerable braces/micromatch code. The installed plugin
has one fast-glob consumer, using `globSync(pattern, { onlyDirectories: true })`.
Tests cover braces, arrays, non-directories and Windows separators, and execute
the actual Next link rule to prove enforcement remains active. Tinyglobby
returns relative paths/trailing separators in some cases; Next already
supports relative roots through `path.join` and filesystem operations.
Do not generalize this override to other fast-glob consumers without testing
their APIs. Remove/reassess it when Next replaces the affected dependency.

**UUID:** only `gaxios@6` and `teeny-request@9` are overridden to UUID 11.1.1.
Both use only CommonJS `v4()` for multipart boundaries, verified against their
installed code. Tests check each consumer's actual module resolution and v4
API, plus a real Storage SDK multipart upload of generic text to a loopback
HTTP fixture, with authentication disabled for that custom endpoint.
UUID 12+ and the latest Google Storage stack were not adopted: their
ESM/Node 22 requirements would broaden the runtime change.
The existing Node 20 hosting/runtime remains unchanged.

Vitest 4.1.11 triggered an npm optional-peer resolver crash while resolving
newer browser peers; aligned 4.1.12 resolves normally using npm 10.8.2.
Existing overridden UUID 9 orphan lock entries were invalidated and the lock
regenerated; frozen installation plus actual consumer-resolution tests confirm
there are no residual installed vulnerable UUID copies in those consumers.

## Verification

```sh
npm ci --ignore-scripts --no-audit --no-fund
prisma generate
npm audit --package-lock-only --include=dev --json
npm audit --include=dev --include=optional --include=peer --json
npm ls --all --json
tsx --eval 'console.log("tsx loader smoke passed")'
```

The two audits return exit 0 and all severity counts zero.
The full dependency trees were captured before and after. Both contain the
same six optional WASM-package `extraneous` warnings, not introduced by this
change: `@emnapi/core@1.10.0`, `@emnapi/runtime@1.10.0`,
`@emnapi/wasi-threads@1.2.1`, `@img/sharp-wasm32@0.35.5`,
`@tybys/wasm-util@0.10.3`, and the latter Sharp package's
`@emnapi/runtime@1.11.3`. No new tree problem was introduced.

Focused suite (external connections blocked):

```sh
NODE_OPTIONS=--require=$PWD/scripts/validation/no-external-network.cjs \
RUN_SESSION_MANAGEMENT_DB_TESTS=0 \
npx --no-install vitest run \
  tests/server/security/dependencyCompatibility.test.ts \
  tests/server/i18n tests/server/series \
  tests/server/authSecret.test.ts tests/server/authSecretConsumers.test.ts \
  tests/server/commerce/authRouteCompatibility.test.ts \
  tests/server/rbac/roleSplitAuthz.test.ts \
  tests/components/seriesTranslationStatus.test.tsx --reporter=dot
```

**215 passed, 34 database-dependent tests skipped; 23 files passed, 1 skipped.**
No customer content or real translation-provider request was used.

- Prisma validation: **passed**; no schema changes.
- TypeScript comparison using the same new dependencies/generated types:
  merged main **255** errors, branch **255**, **zero introduced**;
  191 in the design sandbox. Last baseline diagnostic:
  `tests/server/rateLimit.test.ts:59 TS2540: Cannot assign to 'NODE_ENV'
  because it is a read-only property.`
- Production build: **exit 0**, all **311/311** pages generated and build traces
  collected. Existing CSS/autoprefixer warnings and fixture database connection
  warnings remain. Build configuration already skips type validation and lint;
  those gates must not be inferred from build success.
- The first 180-second build timed out during fixture database lookups.
  A bounded retry with `connect_timeout=1&pool_timeout=1` on the **nonexistent
  loopback fixture database** completed. No real database was used.
- Normal `npm start` smoke: serves the built app; public pre-auth language
  selector renders. A single unavailable-resource 404 was observed in that
  isolated fixture. Signed-in UI was not verified through the screenshot.
- `git diff --check`: passed.

Raw evidence remains in the validation environment:
`/tmp/pr133-release-audit-before.json`, `/tmp/pr133-release-audit-after.json`,
`/tmp/release-security-audit-final.json`,
`/tmp/pr133-release-tree-before.json`, `/tmp/pr133-release-tree-after.json`,
`/tmp/release-security-focused-tests.log`, `/tmp/release-security-build.log`,
and `/tmp/oku-auth-typecheck-{baseline,current}.{json,log}`.
Regenerate these transient files with the commands above if unavailable.

## Read-only deployment and schema findings

For cancelled build `4f82fd76-2533-4780-99f8-c05ba510b5b4`, the deployment API
reports an existing successful, public **Autoscale** deployment. The log API
returned no matching entries for that build ID/cancellation terms; the
specific attempt's terminal state or promoted commit cannot be independently
confirmed from that API. This is not evidence of a new successful publication.

Production schema inspection was read-only and metadata-only:
`ContentTranslation` exists, but **all four columns and the index are absent**:

1. `attemptCount INTEGER NOT NULL DEFAULT 0`
2. `nextAttemptAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
3. `processingUntil TIMESTAMP(3) NULL`
4. `lastErrorCode TEXT NULL`
5. composite index on `(status, nextAttemptAt)`

Therefore the cancelled attempt did **not** apply these five prerequisites
as observed in the production read replica. No production DDL was executed.

## Remaining release sequence — user-operated only

1. Review and merge this PR, then safely update the release checkout to the
   resulting merged main, preserving any unrelated work.
2. In managed Publishing, review the schema diff: only the four additive
   columns and index above, with no drops or data copying. Stop on any extra
   operation. Apply only through the separately reviewed managed release.
3. Verify `DEEPL_AUTH_KEY` remains listed among Production app secrets.
   The user added it there and the out-of-sync warning cleared; this does
   **not** establish it is active in the running, not-yet-republished app.
   Do not display its value or authentication headers.
4. The user may publish on the existing Autoscale configuration after review,
   then verify schema presence, startup and request-bound translation behavior.
   No Reserved VM, continuous translation worker or Redis prerequisite is added.

This dependency PR does not modify application/event content, translation/auth
implementation, deployment configuration or schema. Wine Down sessions remain
entirely outside this change.

## Lockfile portability review correction

The original security commit introduced 96 tarball `resolved` URLs pointing to
the workspace-internal package proxy. Those locations are now normalized to
`https://registry.npmjs.org/`, including scoped packages and the tinyglobby alias.
An exact byte comparison against the original security commit confirms that
**only those 96 URL prefixes changed in the lockfile**: all package versions,
integrity hashes, dependency relationships and other bytes are preserved.

A regression test now checks that every committed tarball locator uses the
public HTTPS npm registry without embedded credentials.

Re-verification after this correction:

- Fresh isolated frozen installation:
  `npm ci --ignore-scripts --no-audit --no-fund --include=dev --include=optional --include=peer`
  — **passed**, and the normalized lockfile remained byte-for-byte unchanged.
- `npm audit --include=dev --include=optional --include=peer --json`
  — **exit 0, zero findings at every severity**.
- Prisma generation against a nonexistent loopback fixture URL — **passed**;
  no database connection or migration was performed.
- The focused suite above, including the new portability test —
  **216 passed, 34 database-dependent skipped; 23 files passed, 1 skipped**.
- `git diff --check` — **passed**.

This installation was verified inside Replit; a separate GitHub-hosted run is
not claimed. No registry configuration or package-firewall policy was changed.
The prior production build was not repeated for this URL-only lockfile change:
its exact versions and integrity hashes remain unchanged.

Current verification evidence:
`/tmp/pr134-portability-install.log`, `/tmp/pr134-portability-audit.json`,
`/tmp/pr134-portability-prisma.log`, `/tmp/pr134-portability-tests.log`.
No merge, deployment or event-data modification accompanies this correction.
