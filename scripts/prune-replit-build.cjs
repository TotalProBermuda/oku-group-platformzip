#!/usr/bin/env node
'use strict';

// Deployment image cleanup only. Never call from ordinary build/install hooks.
const fs = require('node:fs');
const path = require('node:path');

const ALLOWED = Object.freeze([
  '.git', '.next/cache', '.next-dev', '.cache', '.local/share/pnpm',
  'catch-starter-kit/node_modules', 'artifacts/mockup-sandbox/node_modules',
  'artifacts/mockup-sandbox/dist', '.release-staging-partial-20261022',
]);
const inside = (file, directory) => file === directory || file.startsWith(directory + path.sep);

function inspectPath(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink in cleanup path: ${relative}`);
    if (!inside(fs.realpathSync(current), root)) throw new Error(`Cleanup path escapes project: ${relative}`);
  }
  return current;
}

function checkDependencyLinks(directory, targets) {
  let stat;
  try { stat = fs.lstatSync(directory); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink()) {
    const lexical = path.resolve(path.dirname(directory), fs.readlinkSync(directory));
    let resolved;
    try { resolved = fs.realpathSync(directory); }
    catch (error) { if (error.code !== 'ENOENT') throw error; resolved = lexical; }
    if (targets.some(target => inside(lexical, target) || inside(resolved, target))) {
      throw new Error(`Runtime dependency references cleanup target: ${directory}`);
    }
    return;
  }
  if (!stat.isDirectory() || targets.some(target => inside(directory, target))) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() || entry.isSymbolicLink()) checkDependencyLinks(path.join(directory, entry.name), targets);
  }
}

function planCleanup() {
  // Replit's build snapshot inherits DEV_DOMAIN and has no DEPLOYMENT flag.
  // An isolated canary build verified that writes do not reach the editor.
  // Keep this explicit destructive mode exclusive to [deployment].build;
  // never invoke it from npm build, install, postMerge, or the editor shell.
  if (process.argv.length !== 3 || process.argv[2] !== '--prune-isolated-build-copy') {
    throw new Error('Cleanup requires explicit --prune-isolated-build-copy deployment-build mode. Do not run in the editor.');
  }
  const root = fs.realpathSync(path.join(__dirname, '..'));
  if (root === path.parse(root).root || fs.realpathSync(process.cwd()) !== root) {
    throw new Error('Cleanup must run from its application root.');
  }
  const packagePath = inspectPath(root, 'package.json');
  if (!packagePath || JSON.parse(fs.readFileSync(packagePath, 'utf8')).name !== 'oku-group-platform') {
    throw new Error('Unexpected application package.');
  }
  const buildId = inspectPath(root, '.next/BUILD_ID');
  if (!buildId || !fs.statSync(buildId).isFile() || !fs.readFileSync(buildId, 'utf8').trim()) {
    throw new Error('A successful production build is required before cleanup.');
  }
  // Validate every path and dependency before removing anything.
  const targets = ALLOWED.map(relative => inspectPath(root, relative)).filter(Boolean);
  for (const relative of ['node_modules', '.next', 'public']) {
    checkDependencyLinks(path.join(root, relative), targets);
  }
  return { root, targets };
}

function main() {
  const { root, targets } = planCleanup();
  for (const target of targets) {
    fs.rmSync(target, { recursive: true, force: false });
    console.log(`[deployment-cleanup] Removed build-copy ${path.relative(root, target)}`);
  }
  console.log('[deployment-cleanup] Runtime build, public assets, original media and application dependencies preserved.');
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`[deployment-cleanup] ${error.message}`); process.exitCode = 1; }
}
module.exports = { planCleanup };
