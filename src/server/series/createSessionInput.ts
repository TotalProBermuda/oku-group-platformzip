import { z } from "zod";

const optionalContent = (maxLength: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(maxLength).optional(),
);

const safeImageUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(2048).url().refine((value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "Use a secure HTTPS image URL.").optional(),
);

export const sessionTicketPriceInputSchema = z.array(z.object({
  ticketTypeId: z.string().trim().min(1).max(64),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
}).strict()).max(100).superRefine((prices, ctx) => {
  const ids = prices.map((price) => price.ticketTypeId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each ticket type can have only one price per session." });
});

export const createSessionInputSchema = z
  .object({
    title: z.string().trim().max(160, "Event title must be 160 characters or fewer.").optional(),
    subtitle: optionalContent(240),
    description: optionalContent(5000),
    flyerImageUrl: safeImageUrl,
    ticketPrices: sessionTicketPriceInputSchema.optional(),
    startsAt: z.coerce.date({ invalid_type_error: "Choose a valid start date and time." }),
    endsAt: z.coerce.date({ invalid_type_error: "Choose a valid end date and time." }),
    capacity: z.coerce
      .number()
      .int("Capacity must be a whole number.")
      .min(1, "Capacity must be at least 1.")
      .max(100000, "Capacity must be 100,000 or fewer."),
    occupancyScope: z.enum(["NONE", "SPACE", "VENUE"]).default("NONE"),
    setupMinutes: z.coerce.number().int().min(0).max(720).default(0),
    resetMinutes: z.coerce.number().int().min(0).max(720).default(0),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    path: ["endsAt"],
    message: "End time must be after the start time.",
  });

export const updateSessionContentSchema = z.object({
  title: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? null : value, z.string().trim().max(160).nullable().optional()),
  subtitle: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? null : value, z.string().trim().max(240).nullable().optional()),
  description: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? null : value, z.string().trim().max(5000).nullable().optional()),
  flyerImageUrl: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? null : value, z.string().trim().max(2048).url().refine((value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "Use a secure HTTPS image URL.").nullable().optional()),
}).strict();
