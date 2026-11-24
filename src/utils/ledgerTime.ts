import { DateTime } from "luxon";
import { policy } from "../config/policy.ts";

/**
 * Times as they appear in ledger descriptions.
 *
 * ISO 8601 in UTC (`2026-11-17T22:58:56Z`), and, when `LEDGER_TIME_ZONE` is
 * set, the same span in local time after it. This replaces JavaScript's
 * default `Date` string ("Tue Nov 17 2026 22:58:56 GMT+0000 (Coordinated
 * Universal Time)"), which users read as local time and then report as a
 * charge for time they did not use.
 *
 * Kept compact on purpose: a ledger description is at most 255 characters.
 */

const parse = (value: Date | string) =>
  value instanceof Date
    ? DateTime.fromJSDate(value, { zone: "utc" })
    : DateTime.fromISO(value, { zone: "utc" });

/** One instant: `2026-11-17T22:58:56Z`, with milliseconds when there are any. */
export const ledgerInstant = (
  value: Date | string | null | undefined,
): string => {
  if (value === null || value === undefined) return "?";
  const t = parse(value);
  return t.isValid
    ? (t.toISO({ suppressMilliseconds: true }) ?? String(value))
    : String(value);
};

/**
 * A span: `2026-11-17T22:58:56Z - 2026-11-17T23:03:09Z (Europe/Rome 2026-11-17
 * 23:58:56 - 00:03:09)`. The local end shows its date only when it differs.
 */
export const ledgerWindow = (
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string => {
  const utc = `${ledgerInstant(start)} - ${ledgerInstant(end)}`;
  const zone = policy.ledgerTimeZone;
  if (!zone || !start || !end) return utc;
  const s = parse(start).setZone(zone);
  const e = parse(end).setZone(zone);
  if (!s.isValid || !e.isValid) return utc;
  const endFormat = s.hasSame(e, "day") ? "HH:mm:ss" : "yyyy-MM-dd HH:mm:ss";
  return `${utc} (${zone} ${s.toFormat("yyyy-MM-dd HH:mm:ss")} - ${e.toFormat(endFormat)})`;
};

/** Ledger descriptions are VARCHAR(255): never fail a charge over its label. */
export const ledgerDescription = (text: string) =>
  text.length <= 255 ? text : `${text.slice(0, 254)}…`;
