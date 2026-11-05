import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("post-merge database safety", () => {
  it.each([
    { failAt: "", exitCode: 0, expected: ["npm ci", "npx prisma generate", "npm run i18n:check"] },
    { failAt: "npm ci", exitCode: 1, expected: ["npm ci"] },
    { failAt: "npx prisma generate", exitCode: 2, expected: ["npm ci", "npx prisma generate"] },
    { failAt: "npm run i18n:check", exitCode: 3, expected: ["npm ci", "npx prisma generate", "npm run i18n:check"] },
  ])("uses locked dependencies and propagates setup failure at '$failAt'", ({ failAt, exitCode, expected }) => {
    const dir = mkdtempSync(join(tmpdir(), "oku-postmerge-test-"));
    try {
      const log = join(dir, "calls");
      for (const binary of ["npm", "npx"]) {
        writeFileSync(join(dir, binary), `#!/bin/sh\ncommand="${binary} $*"\necho "$command" >> "$TEST_LOG"\nif [ "$command" = "$TEST_FAIL_AT" ]; then exit "$TEST_EXIT"; fi\ncase "$command" in\n "npm ci"|"npx prisma generate"|"npm run i18n:check") exit 0;;\n *) exit 99;;\nesac\n`, { mode: 0o755 });
      }
      const result = spawnSync("bash", ["scripts/post-merge.sh"], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_LOG: log, TEST_EXIT: String(exitCode), TEST_FAIL_AT: failAt },
        encoding: "utf8",
      });
      const calls = readFileSync(log, "utf8");
      expect(calls.trim().split("\n")).toEqual(expected);
      expect(calls).not.toMatch(/migrate|db push|accept-data-loss|npm install/);
      expect(result.stdout.includes("Post-merge setup complete")).toBe(exitCode === 0);
      expect(result.status).toBe(exitCode);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
