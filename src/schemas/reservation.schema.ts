import { z } from "zod";
import { recurrenceSchema } from "utils/recurrence.ts";

export const createReservationSchema = z.object({
  slot_id: z.number().int().nullish(),
  project_id: z.number().int(),
  made_by: z.number().nullish(),
  day: z.iso.date().nullish(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  description: z.string().nullish(),
});

export const updateReservationSchema = createReservationSchema; //.partial();

export type CreateReservationDto = z.infer<typeof createReservationSchema>;
export type UpdateReservationDto = z.infer<typeof updateReservationSchema>;

/**
 * A recurring series of reservations. Each occurrence is placed in the slot of
 * the project's organization that covers it, resolved by the server — the
 * caller does not pick slots one by one. `dry_run` and `skip_conflicts` as for
 * slot series.
 */
export const createReservationSeriesSchema = z.object({
  project_id: z.number().int(),
  description: z.string().nullish(),
  recurrence: recurrenceSchema,
  dry_run: z.boolean().default(false),
  skip_conflicts: z.boolean().default(false),
});

export type CreateReservationSeriesDto = z.infer<
  typeof createReservationSeriesSchema
>;
