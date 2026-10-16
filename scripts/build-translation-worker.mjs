import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(".translation-worker", { recursive: true });
const result = await build({
  entryPoints: ["worker/translations.ts"],
  outfile: ".translation-worker/translations.cjs",
  bundle: true,
  platform: "node",
  target: "node20",
  packages: "external",
  metafile: true,
});
await writeFile(".translation-worker/metafile.json", JSON.stringify(result.metafile));
