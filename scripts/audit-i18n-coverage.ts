#!/usr/bin/env tsx
/**
 * scripts/audit-i18n-coverage.ts
 *
 * Scans TSX/TS source files for likely hardcoded visible UI strings that
 * are NOT going through the translation system. Produces a report of
 * candidate strings that need to be moved to translation JSON files.
 *
 * Usage:
 *   npx tsx scripts/audit-i18n-coverage.ts
 *   npx tsx scripts/audit-i18n-coverage.ts --dir src/components/membership
 */

import fs from "fs";
import path from "path";

const SCAN_DIR = process.argv[3] || "src";
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.next/,
  /\.test\./,
  /\.spec\./,
  /translationsData\.ts/,
  /translations\//,
  /translatableFields\.ts/,
];

interface Finding {
  file: string;
  line: number;
  text: string;
  context: string;
}

const findings: Finding[] = [];

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some((p) => p.test(filePath));
}

function scanFile(filePath: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (trimmed.startsWith("import ") || trimmed.startsWith("export type")) return;

    // Look for JSX text content (text between > and <)
    const jsxTextMatch = trimmed.match(/>([A-Z][a-z].{8,}?)</);
    if (jsxTextMatch) {
      const text = jsxTextMatch[1].trim();
      if (text.length > 8 && !text.includes("{") && !text.includes("©") && !text.includes("→")) {
        findings.push({ file: filePath, line: lineNum, text, context: trimmed.slice(0, 120) });
      }
    }

    // Look for string props with visible text (aria-label, placeholder, title, alt)
    const propMatch = trimmed.match(/(?:placeholder|aria-label|title|alt)="([^"]{6,})"/);
    if (propMatch) {
      const text = propMatch[1];
      if (!text.includes("{") && /[A-Z]/.test(text[0])) {
        findings.push({ file: filePath, line: lineNum, text, context: trimmed.slice(0, 120) });
      }
    }
  });
}

function walk(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (shouldIgnore(fullPath)) continue;
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      scanFile(fullPath);
    }
  }
}

console.log(`\n🔍 Scanning ${SCAN_DIR} for untranslated UI strings...\n`);
walk(SCAN_DIR);

if (findings.length === 0) {
  console.log("✅ No obvious hardcoded strings detected.\n");
} else {
  console.log(`⚠️  Found ${findings.length} candidate strings that may need translation:\n`);
  const byFile: Record<string, Finding[]> = {};
  for (const f of findings) {
    byFile[f.file] = byFile[f.file] ?? [];
    byFile[f.file].push(f);
  }
  for (const [file, items] of Object.entries(byFile)) {
    console.log(`\n  📄 ${file} (${items.length})`);
    for (const item of items.slice(0, 5)) {
      console.log(`     L${item.line}: "${item.text.slice(0, 80)}"`);
    }
    if (items.length > 5) {
      console.log(`     ... and ${items.length - 5} more`);
    }
  }
  console.log(`\nTotal: ${findings.length} findings across ${Object.keys(byFile).length} files.`);
  console.log("Action: Move these strings to the appropriate namespace JSON files and use t(namespace, key) in components.\n");
}
