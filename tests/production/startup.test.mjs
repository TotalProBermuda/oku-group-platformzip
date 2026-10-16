import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "../..");
const launcher = join(root, "tests/production/fixtures/launcher.mjs");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function launch(t, env = {}) {
  const dir = await mkdtemp(join(tmpdir(), "translation-startup-test-"));
  const tracePath = join(dir, "trace.jsonl");
  const child = spawn(process.execPath, [launcher], {
    cwd: root, env: { ...process.env, ...env, TEST_TRACE: tracePath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  const closed = once(child, "close");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await closed;
    await rm(dir, { recursive: true, force: true });
  });
  const trace = async () => {
    try { return (await readFile(tracePath, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  const waitFor = async predicate => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const events = await trace();
      if (predicate(events)) return events;
      await delay(20);
    }
    throw new Error("Fixture readiness deadline exceeded: " + output);
  };
  return { child, closed, trace, waitFor, output: () => output };
}

test("production bundle contains translation processing only; no Redis/unrelated jobs", async () => {
  const meta = JSON.parse(await readFile(join(root, ".translation-worker/metafile.json"), "utf8"));
  assert.deepEqual(Object.keys(meta.inputs).sort(), [
    "src/lib/prisma.ts", "src/server/i18n/deeplProvider.ts",
    "src/server/i18n/translationProcessor.ts", "worker/translations.ts",
  ]);
  assert.deepEqual(Object.values(meta.outputs).flatMap(output => output.imports.map(item => item.path)), ["@prisma/client"]);
  const shell = await readFile(join(root, "scripts/deploy-prisma-with-rate-limit-repair.sh"), "utf8");
  assert.match(shell, /exec node scripts\/start-production\.mjs/);
  assert.doesNotMatch(shell, /prisma migrate|worker\/index/);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  test(`readiness precedes web startup; ${signal} reaches both direct children`, { timeout: 10000 }, async t => {
    const run = await launch(t);
    const events = await run.waitFor(events => events.some(e => e.role === "web" && e.event === "started"));
    assert.ok(events.findIndex(e => e.event === "ready") < events.findIndex(e => e.role === "web"));
    run.child.kill(signal);
    const [code] = await run.closed;
    assert.equal(code, 0);
    const stopped = await run.trace();
    for (const role of ["web", "worker"]) assert.ok(stopped.some(e => e.role === role && e.event === signal));
  });
}

for (const role of ["worker", "web"]) {
  test(`${role} unexpected exit(0) stops the sibling and fails the supervisor`, { timeout: 10000 }, async t => {
    const run = await launch(t, { [`TEST_${role.toUpperCase()}_MODE`]: "exit" });
    const [code] = await run.closed;
    assert.equal(code, 1);
    const events = await run.trace();
    assert.ok(events.some(e => e.role !== role && e.event === "SIGTERM"));
  });
}

for (const mode of ["startup-fail", "spawn-error", "hang"]) {
  test(`${mode}: web never starts, supervisor exits nonzero`, { timeout: 10000 }, async t => {
    const run = await launch(t, { TEST_WORKER_MODE: mode });
    const [code] = await run.closed;
    assert.equal(code, 1);
    assert.ok(!(await run.trace()).some(e => e.role === "web"));
  });
}

test("shutdown deadline force-kills a child that ignores SIGTERM", { timeout: 10000 }, async t => {
  const run = await launch(t, { TEST_WORKER_MODE: "ignore-term" });
  const events = await run.waitFor(events => events.some(e => e.role === "web"));
  run.child.kill("SIGTERM");
  await delay(100);
  run.child.kill("SIGTERM"); // Repeated deployment signals must not orphan children.
  const [code] = await run.closed;
  assert.equal(code, 1);
  assert.match(run.output(), /shutdown deadline reached/);
  for (const event of events.filter(e => e.pid)) {
    assert.throws(() => process.kill(event.pid, 0), { code: "ESRCH" });
  }
});

async function fixtureBundle(t) {
  const dir = await mkdtemp(join(tmpdir(), "translation-worker-bundle-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outfile = join(dir, "worker.cjs");
  await build({
    absWorkingDir: root, entryPoints: ["worker/translations.ts"], outfile,
    bundle: true, platform: "node", target: "node20", packages: "external",
    alias: { "@/lib/prisma": "./tests/production/fixtures/prisma.ts" },
  });
  return outfile;
}

test("real worker entry/processor finish in-flight translation, claim no next row, then disconnect", { timeout: 10000 }, async t => {
  const bundle = await fixtureBundle(t);
  const run = await launch(t, { TEST_WORKER_BUNDLE: bundle, DEEPL_AUTH_KEY: "fixture:fx" });
  await run.waitFor(events => events.some(e => e.role === "provider") && events.some(e => e.role === "web"));
  run.child.kill("SIGTERM");
  assert.equal((await run.closed)[0], 0);
  const events = await run.trace();
  assert.equal(events.filter(e => e.event === "claimed").length, 1);
  assert.ok(events.findIndex(e => e.event === "completed") < events.findIndex(e => e.event === "disconnected"));
});

test("real worker fails closed on schema preflight without exposing database details", { timeout: 10000 }, async t => {
  const bundle = await fixtureBundle(t);
  const run = await launch(t, { TEST_WORKER_BUNDLE: bundle, TEST_SCHEMA_FAIL: "1" });
  assert.equal((await run.closed)[0], 1);
  assert.ok(!(await run.trace()).some(e => e.role === "web"));
  assert.match(run.output(), /startup schema\/database check failed/);
  assert.doesNotMatch(run.output(), /PRIVATE DATABASE DETAILS/);
});

test("missing provider key keeps the worker/web available with explicit English fallback", { timeout: 10000 }, async t => {
  const bundle = await fixtureBundle(t);
  const run = await launch(t, { TEST_WORKER_BUNDLE: bundle, DEEPL_AUTH_KEY: "" });
  await run.waitFor(events => events.some(e => e.role === "web"));
  assert.match(run.output(), /provider not configured; English fallback remains active/);
  assert.ok(!(await run.trace()).some(e => e.role === "provider"));
  run.child.kill("SIGTERM");
  assert.equal((await run.closed)[0], 0);
});

test("built Next.js starts with AUTH_SECRET only under the real supervisor and serves its health route", {
  timeout: 20000, skip: !existsSync(join(root, ".next/BUILD_ID")),
}, async t => {
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const run = await launch(t, {
    TEST_WEB_MODE: "real-next", PORT: String(port),
    NEXTAUTH_SECRET: "",
    AUTH_SECRET: "isolated-build-fixture-not-a-deployment-credential",
    DATABASE_URL: "postgresql://validation:validation@127.0.0.1:55439/translation_startup_check?connect_timeout=1&pool_timeout=1",
    NODE_OPTIONS: `--require=${join(root, "scripts/validation/no-external-network.cjs")}`,
  });
  let result;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
      result = { status: response.status, body: await response.json() };
      break;
    } catch { await delay(50); }
  }
  assert.ok(result, "Next.js did not serve HTTP: " + run.output());
  // No real DB is available/used: health must truthfully report DB unavailable.
  assert.equal(result.status, 503);
  assert.equal(result.body.checks.application, "ok");
  assert.equal(result.body.checks.database, "unavailable");
  // Exercise Node auth configuration too, not only the unauthenticated health route.
  const providers = await fetch(`http://127.0.0.1:${port}/api/auth/providers`);
  assert.equal(providers.status, 200);
  assert.ok((await providers.json()).passwordless);
  run.child.kill("SIGTERM");
  assert.equal((await run.closed)[0], 0);
});
