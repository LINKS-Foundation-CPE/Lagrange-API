import { Transaction } from "sequelize";
import * as reservationRepo from "../repositories/reservation.repository.ts";

/**
 * How much of a job's execution its own project's reservations cover.
 *
 * Reserved time is paid when the reservation is made, so the part of a job
 * that executes inside a reservation of its project must not be billed again.
 * Coverage is decided by when the job **executed**, not when it was submitted:
 * a job queued just before a reservation runs inside it, and a job submitted
 * at the end of one may run after it.
 *
 * Intervals are half-open, `[start, end)`, and compared as instants (UTC):
 * a job ending exactly when a reservation starts is not covered by it.
 */

export interface Interval {
  start: Date;
  end: Date;
}

export interface Coverage {
  /** Execution time, in ms (0 if the window is empty or inverted). */
  durationMs: number;
  /** The part inside the project's reservations, in ms. */
  insideMs: number;
  /** The part outside them, in ms: what is billable. */
  outsideMs: number;
  /** The reservations it overlaps, by id. */
  reservationIds: number[];
}

/**
 * Milliseconds of `job` covered by the union of `blocks`.
 *
 * Blocks are clipped to the job and merged before summing, so overlapping
 * blocks are never counted twice. (Reservations cannot overlap each other
 * today, but the arithmetic does not depend on it.)
 */
export const coveredMs = (job: Interval, blocks: Interval[]): number => {
  const s = job.start.getTime();
  const e = job.end.getTime();
  if (!(e > s)) return 0;
  const clipped = blocks
    .map((b) => [Math.max(s, b.start.getTime()), Math.min(e, b.end.getTime())])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const [a, b] of clipped) {
    if (a > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else {
      curEnd = Math.max(curEnd, b);
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
};

/** Coverage of a job's execution by its own project's reservations. */
export const coverageFor = async (
  projectId: number,
  execution: Interval,
  tx?: Transaction,
): Promise<Coverage> => {
  const raw = execution.end.getTime() - execution.start.getTime();
  // An inverted window bills nothing; an unparseable one (NaN) neither.
  const durationMs = Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (durationMs === 0) {
    return { durationMs, insideMs: 0, outsideMs: 0, reservationIds: [] };
  }
  const blocks = await reservationRepo.getProjectReservationsOverlapping(
    projectId,
    execution.start,
    execution.end,
    tx,
  );
  const insideMs = coveredMs(execution, blocks);
  return {
    durationMs,
    insideMs,
    outsideMs: durationMs - insideMs,
    reservationIds: blocks.map((b) => b.id),
  };
};
