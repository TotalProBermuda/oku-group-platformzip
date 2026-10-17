// Isolated real-component smoke: no Next server, account, database or gateway.
// UI_TEST_RUNTIME points to an isolated npm runtime containing esbuild/react/react-dom/playwright.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const runtime = process.env.UI_TEST_RUNTIME;
if (!runtime) throw new Error('UI_TEST_RUNTIME is required');
const require = createRequire(join(resolve(runtime), 'package.json'));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const output = await mkdtemp(join(tmpdir(), 'oku-member-ui-'));
await build({ entryPoints: ['tests/fixtures/membership-controls/entry.jsx'], outdir: output,
  bundle: true, jsx: 'automatic', alias: {
    '@': resolve('src'), 'next/link': resolve('tests/fixtures/checkout-preview/link.jsx'),
    'react': join(resolve(runtime), 'node_modules/react'),
    'react-dom': join(resolve(runtime), 'node_modules/react-dom'),
  } });
const server = createServer(async (req, res) => {
  const file = req.url === '/entry.js' ? 'entry.js' : req.url === '/entry.css' ? 'entry.css' : null;
  res.setHeader('Content-Type', file?.endsWith('.js') ? 'text/javascript' : file ? 'text/css' : 'text/html');
  res.end(file ? await readFile(join(output, file)) : '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/entry.css"><div id="root"></div><script src="/entry.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('heading', { name: 'Membership controls — draft workspace' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByLabel('Membership scope').selectOption('ALL_ACTIVE');
    await page.getByLabel('Identity evidence').selectOption('VERIFIED_ACCOUNT');
    await page.getByText('EXCLUDE REFERRER', { exact: true }).waitFor();
    await page.getByLabel('Unresolved split check').check();
    await page.getByText('REVIEW', { exact: true }).waitFor();
    await page.getByLabel('Refund treatment').selectOption('DEDUCTIBLE_EXTRA');
    await page.getByLabel('Pre-disclosed value (USD cents)').fill('1250');
    await page.getByLabel('Value disclosed before purchase').check();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export draft for review — not activation' }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(exported.mode, 'DRAFT_ONLY'); assert.equal(exported.activationBlocked, true);
    assert.equal(exported.deductionCents, 1250);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(output, `membership-${width}.png`), fullPage: true });
    console.log(`PASS ${width}px: no overflow, identity/split preview, deduction and draft export; no page errors`);
    await page.close();
  }
  console.log(`Evidence directory: ${output}`);
} finally { await browser.close(); server.close(); }
