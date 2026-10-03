import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("production startup is schema-neutral", () => {
  it.each(["", "8080"])("starts on configured port %s without database commands", port => {
    const dir = mkdtempSync(join(tmpdir(), "oku-startup-test-"));
    try {
      const log = join(dir, "calls");
      writeFileSync(join(dir, "npm"), '#!/bin/sh\necho "npm $*" >> "$TEST_LOG"\nexit 0\n', { mode: 0o755 });
      writeFileSync(join(dir, "npx"), '#!/bin/sh\necho "UNSAFE npx $*" >> "$TEST_LOG"\nexit 99\n', { mode: 0o755 });
      const result = spawnSync("sh", ["scripts/deploy-prisma-with-rate-limit-repair.sh"], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PORT: port, TEST_LOG: log },
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(readFileSync(log, "utf8")).toBe(`npm run start:next -- -p ${port || "5000"}\n`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
