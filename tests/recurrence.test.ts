import { DateTime } from "luxon";
import {
  expandRecurrence,
  MAX_OCCURRENCES,
  recurrenceSchema,
} from "../src/utils/recurrence.ts";

const base = {
  from: "2026-10-05", // a Monday
  until: "2026-10-18",
  weekdays: [2, 4], // Tuesdays and Thursdays
  start_time: "09:00",
  end_time: "12:00",
  timezone: "Europe/Rome",
};

describe("weekly recurrence", () => {
  it("expands only the chosen weekdays, both ends inclusive", () => {
    const days = expandRecurrence(base).map((o) => o.day);
    expect(days).toEqual([
      "2026-10-06",
      "2026-10-08",
      "2026-10-13",
      "2026-10-15",
    ]);
  });

  it("keeps wall-clock time across a daylight-saving change", () => {
    // Italy leaves summer time on 25 October 2026. 09:00 local is 07:00 UTC
    // the Tuesday before and 08:00 UTC the Tuesday after; a fixed offset would
    // have put the second one at 10:00 local.
    const [before, after] = expandRecurrence({
      ...base,
      from: "2026-10-20",
      until: "2026-10-27",
      weekdays: [2],
    });
    expect(before.start.toISOString()).toBe("2026-10-20T07:00:00.000Z");
    expect(after.start.toISOString()).toBe("2026-10-27T08:00:00.000Z");
    for (const o of [before, after]) {
      expect(
        DateTime.fromJSDate(o.start).setZone("Europe/Rome").toFormat("HH:mm"),
      ).toBe("09:00");
    }
  });

  it("refuses a series longer than the cap rather than creating it", () => {
    expect(() =>
      expandRecurrence({
        ...base,
        from: "2026-01-01",
        until: "2027-12-31",
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      }),
    ).toThrow(String(MAX_OCCURRENCES));
  });

  it.each([
    ["end before start", { end_time: "08:00" }],
    ["a time off the half hour", { start_time: "09:15" }],
    ["an unknown time zone", { timezone: "Mars/Olympus" }],
    ["until before from", { until: "2026-10-01" }],
    ["no weekdays", { weekdays: [] }],
  ])("rejects %s", (_label, change) => {
    expect(recurrenceSchema.safeParse({ ...base, ...change }).success).toBe(
      false,
    );
  });
});
