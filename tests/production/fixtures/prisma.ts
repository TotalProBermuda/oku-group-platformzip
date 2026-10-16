import { appendFileSync } from "node:fs";

const trace = (event: string) => appendFileSync(process.env.TEST_TRACE!, JSON.stringify({ role: "database", event }) + "\n");
let complete = false;
const row = {
  id: "fixture", sourceLocale: "en", targetLocale: "es", sourceText: "Fixture content",
  sourceTextHash: "fixture-hash", status: "PENDING", attemptCount: 0,
  nextAttemptAt: new Date(0), processingUntil: null,
};
export const prisma = {
  contentTranslation: {
    findFirst: async () => {
      trace("schema-check");
      if (process.env.TEST_SCHEMA_FAIL) throw new Error("PRIVATE DATABASE DETAILS");
      return null;
    },
    findMany: async () => complete ? [] : [row, { ...row, id: "second" }],
    updateMany: async ({ data }: { data: { status?: string } }) => {
      if (data.status === "COMPLETED") { complete = true; trace("completed"); }
      else trace("claimed");
      return { count: 1 };
    },
  },
  $disconnect: async () => { trace("disconnected"); },
};
