import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("post-merge database safety", () => {
  it.each([0, 1, 2])("stops on migration failure (exit %s)", exitCode => {
    const dir = mkdtempSync(join(tmpdir(), "oku-postmerge-test-"));
    try {
      const log = join(dir, "calls");
      writeFileSync(join(dir, "npx"), '#!/bin/sh\necho "npx $*" >> "$TEST_LOG"\ncase "$*" in\n "prisma generate") exit 0;;\n "prisma migrate deploy") exit "$TEST_EXIT";;\n *) exit 99;;\nesac\n', { mode: 0o755 });
      writeFileSync(join(dir, "npm"), '#!/bin/sh\necho "npm $*" >> "$TEST_LOG"\nexit 0\n', { mode: 0o755 });
      const result = spawnSync("bash", ["scripts/post-merge.sh"], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_LOG: log, TEST_EXIT: String(exitCode) },
        encoding: "utf8",
      });
      const calls = readFileSync(log, "utf8");
      expect(calls).toContain("npx prisma migrate deploy");
      expect(calls).not.toMatch(/db push|accept-data-loss|migrate reset/);
      expect(calls.includes("npm run i18n:check")).toBe(exitCode === 0);
      expect(result.stdout.includes("Post-merge setup complete")).toBe(exitCode === 0);
      expect(result.status).toBe(exitCode);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
