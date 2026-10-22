import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("production startup is schema-neutral", () => {
  it("propagates the server failure without running repair commands", () => {
    const dir = mkdtempSync(join(tmpdir(), "oku-startup-test-"));
    try {
      writeFileSync(join(dir, "node"), "#!/bin/sh\nexit 37\n", { mode: 0o755 });
      const result = spawnSync("/bin/sh", ["scripts/deploy-prisma-with-rate-limit-repair.sh"], {
        env: { ...process.env, PATH: dir }, encoding: "utf8",
      });
      expect(result.status).toBe(37);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(["", "/tmp/untrusted-node", "/nix/store/missing-runtime/bin/node"])("fails closed without PATH Node or a valid recorded runtime: %s", recorded => {
    const dir = mkdtempSync(join(tmpdir(), "oku-startup-test-"));
    try {
      mkdirSync(join(dir, ".next"));
      mkdirSync(join(dir, "empty-bin"));
      copyFileSync("scripts/deploy-prisma-with-rate-limit-repair.sh", join(dir, "start.sh"));
      if (recorded) writeFileSync(join(dir, ".next/oku-node-runtime-path"), `${recorded}\n`);
      const result = spawnSync("/bin/sh", [join(dir, "start.sh")], {
        cwd: dir, env: { PATH: join(dir, "empty-bin") }, encoding: "utf8",
      });
      expect(result.status).toBe(127);
      expect(result.stderr).toContain("Node.js runtime is unavailable");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(["", "8080"])("starts on configured port %s without database commands", port => {
    const dir = mkdtempSync(join(tmpdir(), "oku-startup-test-"));
    try {
      const log = join(dir, "calls");
      writeFileSync(join(dir, "node"), '#!/bin/sh\necho "node $*" >> "$TEST_LOG"\nexit 0\n', { mode: 0o755 });
      writeFileSync(join(dir, "npm"), '#!/bin/sh\necho "UNSAFE npm $*" >> "$TEST_LOG"\nexit 99\n', { mode: 0o755 });
      writeFileSync(join(dir, "npx"), '#!/bin/sh\necho "UNSAFE npx $*" >> "$TEST_LOG"\nexit 99\n', { mode: 0o755 });
      const result = spawnSync("sh", ["scripts/deploy-prisma-with-rate-limit-repair.sh"], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PORT: port, TEST_LOG: log },
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(readFileSync(log, "utf8")).toBe(`node node_modules/next/dist/bin/next start -p ${port || "5000"}\n`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
