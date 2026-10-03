import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("production startup separation from migrations", () => {
  it.each([0, 1])("does not invoke a migration runner regardless of its exit code (%s)", (exitCode) => {
    const dir = mkdtempSync(join(tmpdir(), "oku-startup-test-"));
    try {
      const log = join(dir, "calls");
      writeFileSync(join(dir, "npx"), '#!/bin/sh\necho "npx $*" >> "$TEST_LOG"\ncase "$*" in\n  "prisma migrate deploy") exit "$TEST_EXIT";;\n  *) exit 1;;\nesac\n', { mode: 0o755 });
      writeFileSync(join(dir, "npm"), '#!/bin/sh\necho "npm $*" >> "$TEST_LOG"\n', { mode: 0o755 });
      const result = spawnSync("sh", ["scripts/deploy-prisma-with-rate-limit-repair.sh"], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_LOG: log, TEST_EXIT: String(exitCode), PORT: "5000" },
      });
      const calls = readFileSync(log, "utf8");
      expect(calls).not.toContain("npx");
      expect(calls).toBe("npm run start:next -- -p 5000\n");
      expect(result.status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("commits the enum before inserting seller roles", () => {
    const sql = readFileSync("prisma/migrations/20260922140000_partner_seller_role/migration.sql", "utf8");
    expect(sql.indexOf("COMMIT;")).toBeGreaterThan(sql.indexOf("ALTER TYPE"));
    expect(sql.indexOf("COMMIT;")).toBeLessThan(sql.indexOf('INSERT INTO "Role"'));
    expect(sql).toContain('ON CONFLICT ("userId", "roleKey") DO NOTHING');
  });
});
