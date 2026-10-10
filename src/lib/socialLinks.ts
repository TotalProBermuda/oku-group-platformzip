import { z } from "zod";

const socialUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().url().max(2048).refine((value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "Use a secure HTTPS link.").optional(),
);

export const seriesSocialLinksSchema = z.object({
  website: socialUrl,
  instagram: socialUrl,
  facebook: socialUrl,
  tiktok: socialUrl,
  youtube: socialUrl,
  x: socialUrl,
  whatsapp: socialUrl,
}).strict().transform((value) => Object.fromEntries(
  Object.entries(value).filter(([, url]) => typeof url === "string" && url.length > 0),
));

export type SeriesSocialLinks = z.infer<typeof seriesSocialLinksSchema>;

export const SERIES_SOCIAL_LINK_LABELS: Record<keyof SeriesSocialLinks, string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  whatsapp: "WhatsApp",
};
