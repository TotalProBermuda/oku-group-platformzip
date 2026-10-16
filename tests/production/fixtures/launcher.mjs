import { superviseProduction } from "../../../scripts/start-production.mjs";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./child.mjs", import.meta.url));
const worker = process.env.TEST_WORKER_BUNDLE
  ? [process.execPath, "--import", fileURLToPath(new URL("./provider.mjs", import.meta.url)), process.env.TEST_WORKER_BUNDLE]
  : process.env.TEST_WORKER_MODE === "spawn-error"
    ? ["/nonexistent/translation-worker-executable"]
    : [process.execPath, fixture, "worker", process.env.TEST_WORKER_MODE || "ready"];
process.exitCode = await superviseProduction({
  worker,
  ...(process.env.TEST_WEB_MODE === "real-next" ? {} : {
    web: [process.execPath, fixture, "web", process.env.TEST_WEB_MODE || "ready"],
  }),
  startupTimeoutMs: process.env.TEST_WORKER_MODE === "hang" ? 600 : 3000,
  shutdownTimeoutMs: process.env.TEST_WORKER_MODE === "ignore-term" ? 300 : 2000,
});
