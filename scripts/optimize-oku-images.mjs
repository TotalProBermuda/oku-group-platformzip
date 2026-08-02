/**
 * OKÜ Image Optimization Script
 * Processes slugified images from public/images/oku/ into class-specific
 * web-optimised versions saved to public/images/oku/optimized/.
 *
 * Classes:
 *   cocktail-*  → 1200×1600  portrait  (3:4)  quality 85
 *   interior-*  → 1600×1067  landscape (3:2)  quality 85
 *   dsc0*       → 2000px max width      quality 82  (legacy full-res pass)
 *
 * Usage:
 *   node scripts/optimize-oku-images.mjs           # process all
 *   node scripts/optimize-oku-images.mjs --dry-run # preview only
 */

import sharp from "sharp";
import { readdir, stat, mkdir } from "fs/promises";
import { join, basename, extname } from "path";

const INPUT_DIR = "public/images/oku";
const OUTPUT_DIR = "public/images/oku/optimized";
const DRY_RUN = process.argv.includes("--dry-run");

function isCocktail(name) { return /^cocktail-/.test(name); }
function isInterior(name) { return /^interior-/.test(name); }
function isLegacyDsc(name) { return /^dsc0/.test(name); }

async function optimize() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const files = await readdir(INPUT_DIR);
  const jpegs = files.filter(f => /\.(jpg|jpeg)$/i.test(extname(f)));

  console.log(`Found ${jpegs.length} source images`);
  if (DRY_RUN) console.log("DRY RUN — no files will be written.\n");

  let totalSaved = 0;

  for (const file of jpegs) {
    const base = basename(file, extname(file)).toLowerCase();
    const inputPath = join(INPUT_DIR, file);
    const { size: before } = await stat(inputPath);

    let config;
    if (isCocktail(base)) {
      config = { w: 1200, h: 1600, quality: 85, label: "cocktail 1200×1600 portrait" };
    } else if (isInterior(base)) {
      config = { w: 1600, h: 1067, quality: 85, label: "interior 1600×1067 landscape" };
    } else if (isLegacyDsc(base)) {
      config = { w: 2000, h: null, quality: 82, label: "legacy 2000px-max" };
    } else {
      console.log(`  SKIP  ${file} (no matching class)`);
      continue;
    }

    const outputPath = join(OUTPUT_DIR, file);

    if (!DRY_RUN) {
      let pipeline = sharp(inputPath);

      if (config.h) {
        pipeline = pipeline.resize(config.w, config.h, {
          fit: "cover",
          position: "centre",
          withoutEnlargement: true,
        });
      } else {
        pipeline = pipeline.resize({ width: config.w, withoutEnlargement: true });
      }

      await pipeline
        .jpeg({ quality: config.quality, mozjpeg: true })
        .toFile(outputPath);

      const { size: after } = await stat(outputPath);
      totalSaved += Math.max(0, before - after);
      console.log(
        `  OPT [${config.label}]  ${file}  ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB  (-${Math.max(0, (1 - after / before) * 100).toFixed(0)}%)`
      );
    } else {
      console.log(
        `  WOULD [${config.label}]  ${file}  ${(before / 1024).toFixed(0)} KB`
      );
    }
  }

  if (!DRY_RUN) {
    console.log(`\n✓ Optimized images in: ${OUTPUT_DIR}`);
    if (totalSaved > 0) {
      console.log(`✓ Total saved vs source: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
    }
  }
}

optimize().catch(err => { console.error(err); process.exit(1); });
