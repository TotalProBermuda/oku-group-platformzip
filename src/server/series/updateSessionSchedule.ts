import { z } from "zod";

export const updateSessionScheduleSchema = z.object({
  startsAt: z.coerce.date({ invalid_type_error: "Choose a valid start date and time." }),
  endsAt: z.coerce.date({ invalid_type_error: "Choose a valid end date and time." }),
  capacity: z.coerce.number()
    .int("Capacity must be a whole number.")
    .min(1, "Capacity must be at least 1.")
    .max(100000, "Capacity must be 100,000 or fewer."),
}).strict().refine((value) => value.endsAt > value.startsAt, {
  path: ["endsAt"],
  message: "End time must be after the start time.",
});

export type UpdateSessionScheduleInput = z.infer<typeof updateSessionScheduleSchema>;

export function minimumSafeCapacity(soldCount: number, activeTicketCount: number) {
  return Math.max(soldCount, activeTicketCount);
}
