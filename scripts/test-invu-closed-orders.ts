import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/server/services/invu/invuEncryptionService";

const BASE = "https://api6.invupos.com/invuApiPos/index.php";

async function callClosed(token: string, finiSec: number, ffinSec: number) {
  const url = `${BASE}?r=citas/ordenesAllAdv/fini/${finiSec}/ffin/${ffinSec}/tipo/1/grouping/1`;
  const res = await fetch(url, {
    headers: { accept: "application/json", authorization: token },
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch {}
  return { status: res.status, parsed, raw: text.slice(0, 400) };
}

async function main() {
  const creds = await prisma.invuIntegrationCredential.findMany({
    where: { status: "CONNECTED" },
    include: { venue: true },
  });
  if (creds.length === 0) {
    console.log("No CONNECTED INVU credential found.");
    return;
  }
  for (const c of creds) {
    if (!c.accessTokenEncrypted) {
      console.log(`Venue ${c.venue?.slug ?? c.venueId}: no token stored.`);
      continue;
    }
    const token = decrypt(c.accessTokenEncrypted);
    console.log(`\n=== Venue: ${c.venue?.slug ?? c.venueId} (token ${c.accessTokenMasked}) ===`);

    // 1) Single day: April 20, 2026 UTC
    const apr20Start = 1776643200;
    const apr20End = 1776729599;
    const r1 = await callClosed(token, apr20Start, apr20End);
    console.log(`\n[1] Apr 20, 2026 (1 day) — HTTP ${r1.status}`);
    summarize(r1.parsed, r1.raw);

    // 2) Last 7 days ending Apr 20
    const r2 = await callClosed(token, apr20Start - 6 * 86400, apr20End);
    console.log(`\n[2] Apr 14–20, 2026 (7 days) — HTTP ${r2.status}`);
    summarize(r2.parsed, r2.raw);

    // 3) Last 30 days (max window) ending Apr 20
    const r3 = await callClosed(token, apr20Start - 29 * 86400, apr20End);
    console.log(`\n[3] Mar 22–Apr 20, 2026 (30 days) — HTTP ${r3.status}`);
    summarize(r3.parsed, r3.raw);
  }
}

function summarize(parsed: unknown, raw: string) {
  if (Array.isArray(parsed)) {
    console.log(`  array length: ${parsed.length}`);
    if (parsed.length > 0) {
      console.log(`  first row keys: ${Object.keys(parsed[0] as object).join(", ")}`);
      console.log(`  sample: ${JSON.stringify(parsed[0]).slice(0, 600)}`);
    }
    return;
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    console.log(`  object keys: ${Object.keys(obj).join(", ")}`);
    for (const k of ["data", "records", "rows", "ordenes", "result"]) {
      const v = obj[k];
      if (Array.isArray(v)) {
        console.log(`  .${k} length: ${v.length}`);
        if (v.length > 0) {
          console.log(`  .${k}[0] keys: ${Object.keys(v[0] as object).join(", ")}`);
          console.log(`  sample: ${JSON.stringify(v[0]).slice(0, 600)}`);
        }
      }
    }
    console.log(`  raw head: ${raw}`);
  } else {
    console.log(`  raw: ${raw}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
