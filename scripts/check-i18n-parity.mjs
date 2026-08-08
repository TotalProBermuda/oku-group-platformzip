#!/usr/bin/env node
/**
 * scripts/check-i18n-parity.mjs
 *
 * Verifies every JSON namespace under `src/i18n/translations/<locale>/`
 * has the same set of keys across all supported locales (en, es, pt).
 *
 * Per the OKÜ/Foodie i18n rule (see replit.md):
 *   "Any production user-facing copy must exist in EN, ES, and PT before
 *    the feature is considered complete. Source language may be any of
 *    the three — do not assume English is canonical."
 *
 * This script does NOT judge translation quality. It only catches the
 * common silent failure of shipping a feature whose new strings only
 * landed in one locale's JSON file. CI / pre-merge should run:
 *
 *   node scripts/check-i18n-parity.mjs
 *
 * Exits non-zero with a per-namespace diff when any locale is missing
 * or has extra keys vs. the union of all locales' keys.
 *
 * Flags:
 *   --json           machine-readable output
 *   --namespace=foo  check only `foo.json`
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(process.cwd(), "src/i18n/translations");
const LOCALES = ["en", "es", "pt"];

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const JSON_OUT = args.get("json") === true;
const ONLY_NS = typeof args.get("namespace") === "string" ? args.get("namespace") : null;

/**
 * Flatten a translations namespace into a Set of structural fingerprints.
 *
 * Each entry is "<path>|<kind>" where kind is:
 *   - "nested": the leaf was reached by walking into a nested object
 *   - "flat":   the leaf came from a literal dot-key like "wizard.cta.start"
 *
 * Encoding the access path means that `"a.b": "X"` (flat) and
 * `{"a": {"b": "X"}}` (nested) are detected as DIFFERENT shapes — the i18n
 * loader resolves them differently at runtime, so a parity check that
 * treated them as equivalent would silently miss real production gaps.
 *
 * Also flagged: empty-string values (counted as missing translations).
 */
function flatten(obj, prefix = "", kind = "nested") {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const childKind = k.includes(".") ? "flat" : kind;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const child of flatten(v, key, "nested")) out.add(child);
    } else if (typeof v === "string" && v.trim() === "") {
      // Empty string = missing translation, surface explicitly.
      out.add(`${key}|${childKind}|EMPTY`);
    } else {
      out.add(`${key}|${childKind}`);
    }
  }
  return out;
}

function loadNamespace(locale, ns) {
  const file = path.join(ROOT, locale, `${ns}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  return flatten(JSON.parse(raw));
}

const namespaces = new Set();
for (const locale of LOCALES) {
  const dir = path.join(ROOT, locale);
  if (!fs.existsSync(dir)) {
    console.error(`Missing locale dir: ${dir}`);
    process.exit(2);
  }
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".json")) namespaces.add(f.replace(/\.json$/, ""));
  }
}

const report = [];
let hasGaps = false;

for (const ns of [...namespaces].sort()) {
  if (ONLY_NS && ns !== ONLY_NS) continue;
  const perLocale = Object.fromEntries(
    LOCALES.map((l) => [l, loadNamespace(l, ns)]),
  );
  const union = new Set();
  for (const set of Object.values(perLocale)) {
    if (set) for (const k of set) union.add(k);
  }
  const gaps = {};
  for (const locale of LOCALES) {
    const set = perLocale[locale];
    if (!set) {
      gaps[locale] = { missingFile: true, missing: [...union], extra: [] };
      hasGaps = true;
      continue;
    }
    const missing = [...union].filter((k) => !set.has(k));
    const extra = [...set].filter((k) => !union.has(k));
    if (missing.length || extra.length) {
      gaps[locale] = { missing, extra };
      hasGaps = true;
    }
  }
  if (Object.keys(gaps).length) report.push({ namespace: ns, gaps });
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ ok: !hasGaps, report }, null, 2) + "\n");
} else if (!hasGaps) {
  console.log(`i18n parity OK across [${LOCALES.join(", ")}] for ${namespaces.size} namespaces.`);
} else {
  console.error(`i18n parity FAILED — locale gaps found:\n`);
  for (const { namespace, gaps } of report) {
    console.error(`  ${namespace}.json:`);
    for (const [locale, g] of Object.entries(gaps)) {
      if (g.missingFile) {
        console.error(`    ${locale}: file missing entirely`);
        continue;
      }
      if (g.missing.length) {
        console.error(`    ${locale} missing ${g.missing.length} key(s):`);
        for (const k of g.missing.slice(0, 20)) console.error(`      - ${k}`);
        if (g.missing.length > 20) console.error(`      … (+${g.missing.length - 20} more)`);
      }
      if (g.extra.length) {
        console.error(`    ${locale} has ${g.extra.length} extra key(s) not in other locales:`);
        for (const k of g.extra.slice(0, 20)) console.error(`      + ${k}`);
        if (g.extra.length > 20) console.error(`      … (+${g.extra.length - 20} more)`);
      }
    }
  }
  console.error(
    `\nPer project rule (replit.md → i18n parity): every supported locale ` +
      `must carry every key. Add the missing translations, then re-run.`,
  );
}

process.exit(hasGaps ? 1 : 0);
