import { createHash } from "node:crypto";

export const sourceHash = (text: string) => createHash("sha256").update(text).digest("hex");
// Pre-existing general translations used a truncated hash. New writes use 64 characters.
export const matchesSource = (hash: string, text: string) => hash === sourceHash(text) || hash === sourceHash(text).slice(0, 16);
