import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let root: string;
const put = (name: string, value = "preserve") => {
  const file = join(root, name);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, value);
};
const run = (args = ["--prune-isolated-build-copy"], cwd = root) => spawnSync(process.execPath, [join(root, "scripts/prune-replit-build.cjs"), ...args], {
  cwd, env: { ...process.env, REPLIT_DEPLOYMENT: undefined, REPLIT_DEV_DOMAIN: "editor.replit.dev" }, encoding: "utf8",
});
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "oku-packaging-test-"));
  put("package.json", JSON.stringify({ name: "oku-group-platform" }));
  put(".next/BUILD_ID", "tested-build");
  put(".git/objects/fixture");
  mkdirSync(join(root, "scripts"), { recursive: true });
  copyFileSync("scripts/prune-replit-build.cjs", join(root, "scripts/prune-replit-build.cjs"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("deployment image cleanup", () => {
  it("runs only after the deployment build, not ordinary build or install hooks", () => {
    const config = readFileSync(".replit", "utf8");
    const deployment = config.split("[deployment]")[1].split("[postMerge]")[0];
    expect(deployment).toContain('npm run build && node scripts/prune-replit-build.cjs --prune-isolated-build-copy');
    expect(config.split("[deployment]")[0]).not.toContain("prune-replit-build");
    expect(readFileSync("scripts/post-merge.sh", "utf8")).not.toContain("prune-replit-build");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(Object.values(pkg.scripts).join("\n")).not.toContain("prune-replit-build");
  });
  it.each([
    { args: [] },
    { args: ["--unknown"] },
    { args: ["--prune-isolated-build-copy", "extra"] },
  ])("rejects implicit or malformed cleanup invocation before mutation %j", ({ args }) => {
    expect(run(args).status).toBe(1);
    expect(existsSync(join(root, ".git/objects/fixture"))).toBe(true);
  });
  it("rejects an unexpected cwd or package", () => {
    expect(run(undefined, tmpdir()).status).toBe(1);
    put("package.json", '{"name":"other"}');
    expect(run().status).toBe(1);
    expect(existsSync(join(root, ".git/objects/fixture"))).toBe(true);
  });
  it("requires a successful production build", () => {
    rmSync(join(root, ".next/BUILD_ID"));
    expect(run().status).toBe(1);
    expect(existsSync(join(root, ".git/objects/fixture"))).toBe(true);
  });
  it.each([".cache", ".local", "artifacts"])("rejects symlink target or ancestor %s before any removal", name => {
    symlinkSync(tmpdir(), join(root, name));
    expect(run().status).toBe(1);
    expect(existsSync(join(root, ".git/objects/fixture"))).toBe(true);
  });
  it("rejects runtime dependencies into a cleanup target", () => {
    put(".local/share/pnpm/package/index.js");
    mkdirSync(join(root, "node_modules"));
    symlinkSync(join(root, ".local/share/pnpm/package"), join(root, "node_modules/package"));
    expect(run().status).toBe(1);
    expect(existsSync(join(root, ".git/objects/fixture"))).toBe(true);
    expect(existsSync(join(root, ".local/share/pnpm/package/index.js"))).toBe(true);
  });
  it("removes only allowlisted build-copy files and preserves runtime and original media", () => {
    const removed = [".git/objects/fixture", ".next/cache/x", ".next-dev/x", ".cache/x", ".local/share/pnpm/x",
      "catch-starter-kit/node_modules/x", "artifacts/mockup-sandbox/node_modules/x", "artifacts/mockup-sandbox/dist/x", ".release-staging-partial-20261022/x"];
    const kept = [".next/BUILD_ID", ".next/server/page.js", ".next/static/app.js", "node_modules/next/index.js", "public/food.jpg",
      "attached_assets/original.jpg", "src/app/page.tsx", ".local/important.txt", "catch-starter-kit/source.ts", "artifacts/mockup-sandbox/source.ts"];
    removed.forEach(name => put(name));
    kept.forEach(name => put(name));
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    removed.forEach(name => expect(existsSync(join(root, name)), name).toBe(false));
    kept.forEach(name => expect(readFileSync(join(root, name), "utf8"), name).toBe("preserve"));
  });
});
