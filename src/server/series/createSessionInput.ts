import { z } from "zod";

export const createSessionInputSchema = z
  .object({
    title: z.string().trim().max(160, "Event title must be 160 characters or fewer.").optional(),
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
