import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalText = (maxLength: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(maxLength).optional());

export const createSeriesInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(
      z
        .string()
        .min(3, "Slug must be at least 3 characters.")
        .max(80, "Slug must be 80 characters or fewer.")
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use letters, numbers, and hyphens only."),
    ),
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160, "Title must be 160 characters or fewer."),
  description: optionalText(5000),
  category: optionalText(120),
  hostType: z.enum(["OKU", "CATCH", "INFLUENCER", "PARTNER"]),
  venueId: z.string().trim().min(1, "Select an operational venue."),
  spaceId: z.preprocess(blankToNull, z.string().trim().min(1).nullable().optional()),
  influencerId: z.preprocess(blankToUndefined, z.string().trim().min(1).optional()),
  partnerId: z.preprocess(blankToUndefined, z.string().trim().min(1).optional()),
  city: optionalText(120),
  country: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .min(2, "Use a two- or three-letter country code.")
      .max(3, "Use a two- or three-letter country code.")
      .transform((value) => value.toUpperCase())
      .optional(),
  ),
  capacityTotal: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int("Capacity must be a whole number.")
      .min(0, "Capacity cannot be negative.")
      .max(100000, "Capacity cannot exceed 100,000.")
      .optional(),
  ),
  communityUrl: z.preprocess(blankToUndefined, z.string().url("Enter a valid community URL.").optional()),
}).superRefine((value, ctx) => {
  if (value.hostType === "INFLUENCER" && !value.influencerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["influencerId"], message: "Select an influencer host." });
  }
  if (value.hostType === "PARTNER" && !value.partnerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["partnerId"], message: "Select a partner host." });
  }
});
