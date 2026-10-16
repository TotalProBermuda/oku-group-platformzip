import { appendFileSync } from "node:fs";

const [role, mode] = process.argv.slice(2);
const trace = (event) => appendFileSync(process.env.TEST_TRACE, JSON.stringify({ role, event, pid: process.pid }) + "\n");
trace("started");
process.on("disconnect", () => process.exit(0));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    trace(signal);
    if (mode !== "ignore-term") process.exit(0);
  });
}
if (mode === "startup-fail") process.exit(3);
if (role === "worker" && mode !== "hang") {
  trace("ready");
  process.send?.({ type: "translation-worker-ready" });
}
if (mode === "exit") setTimeout(() => process.exit(0), 300);
setInterval(() => {}, 1000);
