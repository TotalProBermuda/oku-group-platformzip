import { z } from "zod";
import { isSafeArtworkUrl } from "@/lib/eventArtwork";
import { panamaDateTimeLocalInput, panamaDateTimeLocalIso } from "@/lib/panamaDateTime";

export const hostRoles = ["PRIMARY_HOST", "CO_HOST", "SPONSOR", "BRAND_PARTNER"] as const;
export const profileRoles = ["HOST", "CO_HOST", "MC", "PRESENTER", "PARTNER", "SPONSOR", "CURATOR", "REFERRER_ORG"] as const;
export const locales = ["en", "es", "pt"] as const;
export type FieldMode = { mode: "inherit" } | { mode: "clear" } | { mode: "override"; value: unknown };
export type FieldModes = Record<string, FieldMode>;
export type EffectiveField = { value: unknown; source: "series" | "override" | "clear" | "legacy"; mode: FieldMode["mode"] };
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const ids = z.array(id).max(100).refine(v => new Set(v).size === v.length, "Duplicate identity");
const schedule = z.object({
  localStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(1).max(10080),
}).strict();
export const sponsorValue = z.array(z.object({
  entityId: id, tierId: id,
  showOnEventPage: z.boolean().default(true), showOnTicket: z.boolean().default(true),
  showOnEmail: z.boolean().default(true), showOnCheckInView: z.boolean().default(false),
}).strict()).max(100).refine(v => new Set(v.map(a => a.entityId)).size === v.length, "Duplicate sponsor");

export function fieldDefinition(key: string): { schema: z.ZodTypeAny; clear: boolean; restricted: boolean } | null {
  if (key === "capacity") return { schema: z.number().int().min(1).max(100000), clear: false, restricted: false };
  if (key === "schedule") return { schema: schedule, clear: false, restricted: false };
  if (["giftBagEnabled", "streetsideEnabled", "allowLateSales"].includes(key))
    return { schema: z.boolean(), clear: false, restricted: true };
  const parts = key.split(".");
  if (parts.length === 3 && parts[0] === "content" && ["title", "subtitle", "description"].includes(parts[1]) && (locales as readonly string[]).includes(parts[2]))
    return { schema: z.string().trim().min(1).max(parts[1] === "description" ? 5000 : parts[1] === "subtitle" ? 240 : 160), clear: true, restricted: false };
  if (parts.length === 2 && parts[0] === "artwork" && (locales as readonly string[]).includes(parts[1]))
    return { schema: z.string().max(2048).refine(isSafeArtworkUrl, "Use a secure artwork URL"), clear: true, restricted: true };
  if (parts.length === 2 && parts[0] === "artworkMobile" && (locales as readonly string[]).includes(parts[1]))
    return { schema: z.string().max(2048).refine(isSafeArtworkUrl, "Use a secure artwork URL"), clear: true, restricted: true };
  if (parts.length === 3 && parts[0] === "ticket" && id.safeParse(parts[1]).success && ["price", "enabled"].includes(parts[2]))
    return { schema: parts[2] === "price" ? z.number().int().min(0).max(100000000) : z.boolean(), clear: false, restricted: true };
  if (parts.length === 2 && ((parts[0] === "hosts" && (hostRoles as readonly string[]).includes(parts[1])) || (parts[0] === "profiles" && (profileRoles as readonly string[]).includes(parts[1]))))
    return { schema: ids, clear: true, restricted: parts[0] === "profiles" };
  if (key === "sponsors") return { schema: sponsorValue, clear: true, restricted: false };
  return null;
}

const modeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("inherit") }).strict(),
  z.object({ mode: z.literal("clear") }).strict(),
  z.object({ mode: z.literal("override"), value: z.unknown().refine(v => v !== undefined, "Value required") }).strict(),
]);
export const fieldPatchSchema = z.record(modeSchema).superRefine((patch, ctx) => {
  if (Object.keys(patch).length > 100)
    ctx.addIssue({ code: "custom", message: "Choose at most 100 fields" });
  for (const [key, edit] of Object.entries(patch)) {
    const def = fieldDefinition(key);
    if (!def) { ctx.addIssue({ code: "custom", path: [key], message: "Unsupported field" }); continue; }
    if (edit.mode === "clear" && !def.clear) ctx.addIssue({ code: "custom", path: [key], message: "This field cannot be cleared" });
    if (edit.mode === "override") {
      const parsed = def.schema.safeParse(edit.value);
      if (!parsed.success) ctx.addIssue({ code: "custom", path: [key], message: parsed.error.issues[0].message });
    }
  }
});
export const managementInputSchema = z.object({
  kind: z.enum(["sessions", "defaults"]),
  sessionIds: z.array(id).max(50).refine(v => new Set(v).size === v.length, "Duplicate session selection"),
  patch: fieldPatchSchema,
  assignmentChanges: z.array(z.object({
    assignmentId: id, status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "RETIRED"]),
  }).strict()).max(50).refine(rows => new Set(rows.map(r => r.assignmentId)).size === rows.length, "Duplicate financial assignment").optional(),
  schedules: z.record(id, z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime() }).strict()
    .refine(v => new Date(v.endsAt) > new Date(v.startsAt), "End must follow start")).optional(),
  postponement: z.object({
    reason: z.string().trim().min(1).max(1000),
    treatment: z.enum(["PRESERVE_ADMISSION", "HOLD_PENDING_DATE"]),
  }).strict().optional(),
}).strict().superRefine((v, ctx) => {
  if (!Object.keys(v.patch).length && !v.schedules && !v.postponement && !v.assignmentChanges?.length) ctx.addIssue({ code: "custom", message: "Choose a change" });
  if (v.assignmentChanges?.length && v.kind !== "defaults")
    ctx.addIssue({ code: "custom", message: "Financial assignments affect the whole series, not selected sessions. No SESSION financial scope exists." });
  if (v.kind === "sessions" && !v.sessionIds.length) ctx.addIssue({ code: "custom", path: ["sessionIds"], message: "Explicit session selection required" });
  if (v.kind === "defaults" && (v.sessionIds.length || v.schedules)) ctx.addIssue({ code: "custom", message: "Defaults target inheritors separately, not a selected occurrence date" });
  if (v.kind === "defaults" && Object.keys(v.patch).some(key => key.startsWith("artworkMobile."))) ctx.addIssue({ code: "custom", message: "Mobile artwork is specific to an event date; choose a session instead of changing series defaults." });
  for (const key of Object.keys(v.schedules ?? {})) if (!v.sessionIds.includes(key)) ctx.addIssue({ code: "custom", message: "Schedule references an unselected session" });
  if (v.postponement?.treatment === "HOLD_PENDING_DATE" && (v.schedules || v.patch.schedule)) ctx.addIssue({ code: "custom", message: "Pending-date hold cannot confirm a replacement schedule" });
});
export type ManagementInput = z.infer<typeof managementInputSchema>;

export function modes(value: unknown): FieldModes {
  return value && typeof value === "object" && !Array.isArray(value) ? value as FieldModes : {};
}
export function patchModes(current: unknown, patch: FieldModes): FieldModes {
  return { ...modes(current), ...patch };
}
export function clearedValue(key: string) {
  return key.startsWith("hosts.") || key.startsWith("profiles.") || key === "sponsors" ? [] : null;
}
export function resolveField(key: string, sessionModes: unknown, defaults: unknown, legacy: unknown, legacyInherits: boolean, seriesLegacy: unknown): EffectiveField {
  const edit = modes(sessionModes)[key];
  if (edit?.mode === "clear") return { value: clearedValue(key), source: "clear", mode: "clear" };
  if (edit?.mode === "override") return { value: edit.value, source: "override", mode: "override" };
  if (!edit && !legacyInherits) return { value: legacy, source: "legacy", mode: "override" };
  const base = modes(defaults)[key];
  const value = base?.mode === "clear" ? clearedValue(key) : base?.mode === "override" ? base.value : seriesLegacy;
  return { value, source: "series", mode: "inherit" };
}
export function applyScheduleTemplate(startsAt: Date, value: unknown) {
  const template = schedule.parse(value);
  const date = panamaDateTimeLocalInput(startsAt).slice(0, 10);
  const start = new Date(panamaDateTimeLocalIso(`${date}T${template.localStart}`));
  return { startsAt: start, endsAt: new Date(start.getTime() + template.durationMinutes * 60000) };
}
