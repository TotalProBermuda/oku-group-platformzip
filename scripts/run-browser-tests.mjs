#!/usr/bin/env node
/**
 * Runs the Playwright browser suite in two memory-bounded batches.
 *
 * The sandbox runs out of memory if all ~20 trust/privacy browser tests
 * (10 tests × 2 viewport projects) are executed in a single Playwright
 * process — chromium contexts plus Next.js dev-server compilation push
 * past the per-invocation heap budget. Splitting on Playwright tags
 * (`@beneficiary` / `@dashboard`) keeps each invocation small while
 * still being driven by a single `npm run test:browser` command.
 *
 * This is more robust than the previous `-g` description grep because
 * tags are explicit metadata on the `test.describe` blocks rather than
 * substrings of the test titles, so renaming a test cannot silently
 * drop it from CI.
 */
import { spawn } from "node:child_process";

const TRUST_SPEC = "tests/browser/trust-components.spec.ts";
const LAUNCH_SPEC = "tests/browser/launch-readiness.spec.ts";

const BATCHES = [
  { name: "beneficiary", spec: TRUST_SPEC, grep: "@beneficiary" },
  { name: "dashboard",   spec: TRUST_SPEC, grep: "@dashboard"   },
  { name: "launch",      spec: LAUNCH_SPEC, grep: "@launch"     },
];

function runPlaywright(spec, grep) {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["playwright", "test", spec, "--grep", grep],
      { stdio: "inherit", env: process.env },
    );
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

let failed = 0;
for (const batch of BATCHES) {
  console.log(`\n=== Running browser tests: ${batch.name} (${batch.grep}) ===\n`);
  const code = await runPlaywright(batch.spec, batch.grep);
  if (code !== 0) {
    console.error(`Batch "${batch.name}" failed with exit code ${code}`);
    failed += 1;
  }
}

process.exit(failed === 0 ? 0 : 1);
