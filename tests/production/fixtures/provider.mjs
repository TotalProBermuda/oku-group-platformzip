import { appendFileSync } from "node:fs";

// Test process only: never makes a provider request or records submitted content.
globalThis.fetch = async () => {
  appendFileSync(process.env.TEST_TRACE, JSON.stringify({ role: "provider", event: "started" }) + "\n");
  await new Promise(resolve => setTimeout(resolve, 400));
  return Response.json({ translations: [{ text: "Fixture translation" }] });
};
