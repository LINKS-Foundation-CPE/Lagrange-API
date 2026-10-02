import { DateTime } from "luxon";
import { z } from "zod";

/**
 * A weekly recurrence: these weekdays, this time of day, between two dates.
 *
 * Deliberately not RFC 5545 RRULE. Slots and reservations in practice repeat on
 * fixed weekdays at a fixed time — "Tuesdays and Thursdays, 9 to 12, until
 * Christmas" — and that is the whole of what this can say. Anything richer
 * belongs in a later version, not in a grammar the dashboard would have to
 * expose.
 *
 * Times are **wall-clock times in `timezone`**, not UTC offsets. A 09:00 slot
 * stays 09:00 in Turin across the October and March clock changes, which a
 * fixed offset would shift by an hour for half the series.
 */
export const MAX_OCCURRENCES = 366;

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, "a time on the hour or half hour, HH:MM");

export const recurrenceSchema = z
  .object({
    /** First day that may hold an occurrence, in `timezone`. */
    from: z.iso.date(),
    /** Last day that may hold an occurrence, inclusive. */
    until: z.iso.date(),
    /** ISO weekdays: 1 is Monday, 7 is Sunday. */
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
    start_time: hhmm,
    end_time: hhmm,
    timezone: z.string().refine((tz) => DateTime.local().setZone(tz).isValid, {
      message: "an IANA time zone, e.g. Europe/Rome",
    }),
  })
  .refine((r) => r.from <= r.until, {
    message: "`from` must not be after `until`",
    path: ["until"],
  })
  .refine((r) => r.start_time < r.end_time, {
    message:
      "`end_time` must be after `start_time` (an occurrence cannot run past midnight)",
    path: ["end_time"],
  });

export type Recurrence = z.infer<typeof recurrenceSchema>;

export interface Occurrence {
  /** The local calendar day, as `slots.day` / `reservations.day` store it. */
  day: string;
  start: Date;
  end: Date;
}

/**
 * Every occurrence the recurrence describes, in order.
 *
 * Throws if there would be more than {@link MAX_OCCURRENCES}: a mistyped year
 * in `until` should be an error to correct, not ten thousand rows to delete.
 */
export const expandRecurrence = (r: Recurrence): Occurrence[] => {
  const zone = r.timezone;
  const weekdays = new Set(r.weekdays);
  const last = DateTime.fromISO(r.until, { zone });
  const out: Occurrence[] = [];

  for (
    let day = DateTime.fromISO(r.from, { zone });
    day <= last;
    day = day.plus({ days: 1 })
  ) {
    if (!weekdays.has(day.weekday)) continue;
    const date = day.toISODate()!;
    out.push({
      day: date,
      start: DateTime.fromISO(`${date}T${r.start_time}`, { zone }).toJSDate(),
      end: DateTime.fromISO(`${date}T${r.end_time}`, { zone }).toJSDate(),
    });
    if (out.length > MAX_OCCURRENCES) {
      throw new Error(
        `the recurrence describes more than ${MAX_OCCURRENCES} occurrences; shorten it`,
      );
    }
  }
  return out;
};
