import { z } from "zod";
import { isSafeArtworkUrl, seriesArtworkFields, sessionArtworkFields, sessionMobileArtworkFields } from "@/lib/eventArtwork";

export const artworkUrlSchema = z.preprocess(
  value => typeof value === "string" ? value.trim() || null : value,
  z.string().refine(isSafeArtworkUrl, "Use a permanent HTTPS image URL or a same-origin asset path.").nullable().optional(),
);
export const seriesArtworkShape = {
  heroImageUrlEn: artworkUrlSchema, heroImageUrlEs: artworkUrlSchema, heroImageUrlPt: artworkUrlSchema,
};
export const sessionArtworkShape = {
  flyerImageUrlEn: artworkUrlSchema, flyerImageUrlEs: artworkUrlSchema, flyerImageUrlPt: artworkUrlSchema,
  flyerImageUrlMobileEn: artworkUrlSchema, flyerImageUrlMobileEs: artworkUrlSchema, flyerImageUrlMobilePt: artworkUrlSchema,
};

type SeriesEdit = Partial<Record<typeof seriesArtworkFields[number], string | null>>;
type SessionEdit = Partial<Record<typeof sessionArtworkFields[number] | typeof sessionMobileArtworkFields[number], string | null>>;
export function parseArtworkEdit(body: Record<string, unknown>, roles: readonly string[], kind: "series"): SeriesEdit;
export function parseArtworkEdit(body: Record<string, unknown>, roles: readonly string[], kind: "session"): SessionEdit;
export function parseArtworkEdit(body: Record<string, unknown>, roles: readonly string[], kind: "series" | "session"): SeriesEdit | SessionEdit {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Expected an artwork object."), { status: 400 });
  }
  const fields = kind === "series" ? seriesArtworkFields : [...sessionArtworkFields, ...sessionMobileArtworkFields];
  const input = Object.fromEntries(fields.filter(field => field in body).map(field => [field, body[field]]));
  if (Object.keys(input).length && !roles.includes("SUPERADMIN")) {
    throw Object.assign(new Error("Only a superadmin can manage localized event artwork."), { status: 403 });
  }
  const parsed = kind === "series" ? z.object(seriesArtworkShape).safeParse(input) : z.object(sessionArtworkShape).safeParse(input);
  if (!parsed.success) throw Object.assign(new Error("Use permanent HTTPS artwork URLs or same-origin asset paths."), { status: 400 });
  return parsed.data;
}

export const artworkUploadSchema = z.object({
  filename: z.string().min(1).max(200).regex(/^[^/\\\u0000-\u001f]+$/),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
}).strict();
