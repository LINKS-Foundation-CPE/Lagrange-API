import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import CustomError from "config/CustomError.ts";
import logger from "config/logger.ts";
import { MINIMUM_SLOT_DURATION } from "config/constants.ts";
import { policy } from "config/policy.ts";
import {
  Notification,
  Reservation,
  Slot,
  transactionManager,
} from "models/index.ts";
import * as slotRepo from "repositories/slot.repository.ts";
import * as reservationRepo from "repositories/reservation.repository.ts";
import * as projectRepo from "repositories/project.repository.ts";
import * as organizationRepo from "repositories/organization.repository.ts";
import * as budgetEventRepo from "repositories/budgetEvent.repository.ts";
import { CreateSlotSeriesDto } from "schemas/slot.schema.ts";
import { CreateReservationSeriesDto } from "schemas/reservation.schema.ts";
import { verifyDates } from "utils/checks.ts";
import { logToDatabase } from "utils/index.ts";
import { expandRecurrence, Occurrence, Recurrence } from "utils/recurrence.ts";
import { refundFor } from "./reservation.service.ts";
import { AuthUser } from "../types/auth.ts";

/**
 * Recurring series of slots and reservations.
 *
 * A series is created as ordinary rows — one per occurrence, exactly what
 * creating each by hand would have produced, plus a shared `series_id` — so
 * that the calendar, the reports and the billing never need to know recurrence
 * exists. Every rule a single create enforces is enforced per occurrence here.
 *
 * Creating is **preview, then choose**. A dry run returns every occurrence and
 * why any of them cannot be created. A real run creates all of them in one
 * transaction, or — when some conflict — refuses and returns the same report,
 * unless the caller has said to skip the conflicting ones. Nothing is ever
 * half-created: a failure partway through rolls the whole series back,
 * including the budget.
 */

export type SeriesOutcome = "preview" | "created" | "refused";

export interface SeriesOccurrence {
  day: string;
  start: string;
  end: string;
  /** The slot a reservation would be placed in; absent for slot series. */
  slot_id?: number | null;
  /** Why this occurrence cannot be created, or null if it can. */
  problem: string | null;
}

export interface SeriesResult {
  outcome: SeriesOutcome;
  series_id: string | null;
  occurrences: SeriesOccurrence[];
  created: number[];
  summary: {
    total: number;
    ok: number;
    conflicts: number;
    /** Reservation series only: what the creatable occurrences cost, in ms. */
    cost_ms?: number;
    remaining_budget_ms?: number;
    /** Set when the project cannot pay for them; creation is then refused. */
    budget_problem?: string | null;
  };
  message?: string;
}

const expand = (recurrence: Recurrence): Occurrence[] => {
  try {
    return expandRecurrence(recurrence);
  } catch (e) {
    throw new CustomError({
      statusCode: 400,
      message: String((e as Error).message ?? e),
    });
  }
};

/** The single-create date rules, as a reason instead of an exception. */
const datesProblem = (o: Occurrence): string | null => {
  try {
    verifyDates({ start: o.start, end: o.end }, MINIMUM_SLOT_DURATION);
    return null;
  } catch (e) {
    return String(e);
  }
};

const describe = (
  o: Occurrence,
  problem: string | null,
  slot_id?: number | null,
) => ({
  day: o.day,
  start: o.start.toISOString(),
  end: o.end.toISOString(),
  ...(slot_id === undefined ? {} : { slot_id }),
  problem,
});

const decide = (
  dryRun: boolean,
  skipConflicts: boolean,
  conflicts: number,
  ok: number,
  budgetProblem: string | null = null,
): { outcome: SeriesOutcome; message?: string } => {
  if (dryRun) return { outcome: "preview" };
  if (budgetProblem) return { outcome: "refused", message: budgetProblem };
  if (ok === 0)
    return {
      outcome: "refused",
      message: "no occurrence of this series can be created",
    };
  if (conflicts > 0 && !skipConflicts) {
    return {
      outcome: "refused",
      message: `${conflicts} occurrence(s) conflict; create the other ${ok} with skip_conflicts, or change the series`,
    };
  }
  return { outcome: "created" };
};

// ── slots ────────────────────────────────────────────────────────────────────

export async function createSlotSeries(
  dto: CreateSlotSeriesDto,
  user: AuthUser,
): Promise<SeriesResult> {
  const plan: { o: Occurrence; problem: string | null }[] = [];
  for (const o of expand(dto.recurrence)) {
    const problem =
      datesProblem(o) ??
      ((await slotRepo.isSlotAlreadyBusy(o.start, o.end))
        ? "overlaps an existing slot"
        : null);
    plan.push({ o, problem });
  }

  const ok = plan.filter((p) => !p.problem);
  const conflicts = plan.length - ok.length;
  const { outcome, message } = decide(
    dto.dry_run,
    dto.skip_conflicts,
    conflicts,
    ok.length,
  );
  const result: SeriesResult = {
    outcome,
    message,
    series_id: null,
    occurrences: plan.map((p) => describe(p.o, p.problem)),
    created: [],
    summary: { total: plan.length, ok: ok.length, conflicts },
  };
  if (outcome !== "created") return result;

  const seriesId = randomUUID();
  const created = await transactionManager.withTransaction(async (tx) => {
    const ids: number[] = [];
    for (const { o } of ok) {
      const slot = await slotRepo.create(
        {
          organization_id: dto.organization_id,
          day: new Date(o.day),
          start: o.start,
          end: o.end,
          series_id: seriesId,
        },
        { transaction: tx },
      );
      ids.push(slot.id);
    }
    return ids;
  });

  logToDatabase({
    userId: user.id,
    action: "create",
    resource: "slots",
    description: `Slot series ${seriesId}: ${created.length} slot(s) for organization ${dto.organization_id} created by ${user.email} (${conflicts} skipped)`,
  });
  return { ...result, series_id: seriesId, created };
}

export async function destroySlotSeries(seriesId: string, user: AuthUser) {
  const now = new Date();
  const future = await Slot.findAll({
    where: { series_id: seriesId, start: { [Op.gt]: now } },
    order: [["start", "ASC"]],
  });
  if (future.length === 0) {
    throw new CustomError({
      statusCode: 404,
      message: "no future slots in this series",
    });
  }

  // The single-slot rule, applied to the series as a whole: a slot holding
  // reservations is not deleted, and neither is the rest of the series around
  // it — deleting part of what was asked for is a surprise.
  const busy = await Reservation.findAll({
    where: { slot_id: { [Op.in]: future.map((s) => s.id) } },
    attributes: ["slot_id"],
  });
  if (busy.length > 0) {
    const busyIds = new Set(busy.map((r) => r.slot_id));
    const days = future
      .filter((s) => busyIds.has(s.id))
      .map((s) => String(s.day));
    throw new CustomError({
      statusCode: 400,
      message: `cannot delete this series: slots on ${days.join(", ")} contain reservations`,
    });
  }

  const past = await Slot.count({
    where: { series_id: seriesId, start: { [Op.lte]: now } },
  });
  await transactionManager.withTransaction(async (tx) => {
    for (const s of future) await s.destroy({ transaction: tx });
  });
  logToDatabase({
    userId: user.id,
    action: "delete",
    resource: "slots",
    description: `Slot series ${seriesId}: ${future.length} future slot(s) deleted by ${user.email}`,
  });
  return { series_id: seriesId, deleted: future.length, kept_past: past };
}

// ── reservations ─────────────────────────────────────────────────────────────

export async function createReservationSeries(
  dto: CreateReservationSeriesDto,
  user: AuthUser,
): Promise<SeriesResult> {
  if (!user.administeredProjects.includes(dto.project_id)) {
    throw new CustomError({ statusCode: 403, message: "Unauthorized" });
  }
  const project = await projectRepo.getOne(dto.project_id);
  if (!project) {
    throw new CustomError({ statusCode: 400, message: "Project not found" });
  }

  // A reservation may sit in a slot of the project's organization or of the
  // organization it descends from — the rule single creates apply.
  const organization = await organizationRepo.getOne(project.organization_id);
  const organizationIds = [
    project.organization_id,
    organization?.reference_organization_id,
  ].filter((id): id is number => typeof id === "number");

  const plan: {
    o: Occurrence;
    problem: string | null;
    slot_id: number | null;
  }[] = [];
  for (const o of expand(dto.recurrence)) {
    let problem = datesProblem(o);
    if (!problem && project.start_at && project.start_at > o.start) {
      problem = "the project has not started yet";
    }
    if (!problem && project.end_at && project.end_at < o.end) {
      problem = "the project has expired by then";
    }
    if (!problem && (await reservationRepo.isSlotAlreadyBusy(o.start, o.end))) {
      problem = "overlaps an existing reservation";
    }
    let slotId: number | null = null;
    if (!problem && policy.slotConstrainedReservations) {
      const slot = await slotRepo.findCovering(organizationIds, o.start, o.end);
      if (slot) slotId = slot.id;
      else problem = "no slot of the project's organization covers this time";
    }
    plan.push({ o, problem, slot_id: slotId });
  }

  const ok = plan.filter((p) => !p.problem);
  const conflicts = plan.length - ok.length;
  const cost = ok.reduce(
    (sum, p) => sum + (p.o.end.getTime() - p.o.start.getTime()),
    0,
  );
  const remaining = Number(project.remaining_budget);
  const budgetProblem =
    ok.length > 0 && cost > remaining
      ? `insufficient budget: these ${ok.length} reservation(s) need ${cost} ms, the project has ${remaining} ms`
      : null;

  const { outcome, message } = decide(
    dto.dry_run,
    dto.skip_conflicts,
    conflicts,
    ok.length,
    budgetProblem,
  );
  const result: SeriesResult = {
    outcome,
    message,
    series_id: null,
    occurrences: plan.map((p) =>
      describe(p.o, p.problem, p.problem ? null : p.slot_id),
    ),
    created: [],
    summary: {
      total: plan.length,
      ok: ok.length,
      conflicts,
      cost_ms: cost,
      remaining_budget_ms: remaining,
      budget_problem: budgetProblem,
    },
  };
  if (outcome !== "created") return result;

  const seriesId = randomUUID();
  const created = await transactionManager.withTransaction(async (tx) => {
    // Debited once for the whole series, recorded once per reservation: the
    // ledger then matches single bookings line for line, and deleting any one
    // occurrence later refunds against its own entry.
    project.remaining_budget = remaining - cost;
    await project.save({ transaction: tx });

    const ids: number[] = [];
    for (const { o, slot_id } of ok) {
      const reservation = await reservationRepo.create(
        {
          slot_id,
          made_by: user.id,
          day: new Date(o.day),
          start: o.start,
          end: o.end,
          description: project.name + " " + (dto.description || ""),
          project_id: project.id,
          series_id: seriesId,
        },
        { transaction: tx },
      );
      await budgetEventRepo.create(
        {
          project_id: project.id,
          value: -(o.end.getTime() - o.start.getTime()),
          description: `reservation ${reservation.id} (${reservation.day} ${reservation.start} - ${reservation.end})`,
          billing: true,
          user_id: user.id,
        },
        { transaction: tx },
      );
      ids.push(reservation.id);
    }
    return ids;
  });

  logToDatabase({
    userId: user.id,
    action: "create",
    resource: "reservations",
    description: `Reservation series ${seriesId}: ${created.length} reservation(s) for project ${project.name} (${project.id}) created by ${user.email}, ${cost} ms debited (${conflicts} skipped)`,
  });
  return { ...result, series_id: seriesId, created };
}

export async function destroyReservationSeries(
  seriesId: string,
  user: AuthUser,
) {
  const now = new Date();
  const future = await Reservation.findAll({
    where: { series_id: seriesId, start: { [Op.gt]: now } },
    order: [["start", "ASC"]],
  });
  if (future.length === 0) {
    throw new CustomError({
      statusCode: 404,
      message: "no future reservations in this series",
    });
  }

  // A series belongs to one project, so one authorization decision covers it —
  // the same one a single delete makes.
  const project = await projectRepo.getOne(future[0].project_id);
  const authorized =
    user.roles.includes("admin") ||
    (user.roles.includes("organization-manager") &&
      user.organization?.id == project?.organization_id) ||
    (user.roles.includes("project-admin") &&
      project != null &&
      user.administeredProjects.includes(project.id));
  if (!authorized) {
    throw new CustomError({ statusCode: 403, message: "Unauthorized" });
  }

  const refunds = future.map((r) =>
    refundFor(new Date(r.start), new Date(r.end), now),
  );
  const refunded = refunds.reduce((a, b) => a + b, 0);
  const past = await Reservation.count({
    where: { series_id: seriesId, start: { [Op.lte]: now } },
  });

  await transactionManager.withTransaction(async (tx) => {
    if (project) {
      project.remaining_budget = Number(project.remaining_budget) + refunded;
      await project.save({ transaction: tx });
    }
    for (const [i, r] of future.entries()) {
      if (project) {
        await budgetEventRepo.create(
          {
            project_id: project.id,
            value: refunds[i],
            description: `reservation deleted ${r.id} (${r.day} ${r.start} - ${r.end})`,
            billing: true,
            user_id: user.id,
          },
          { transaction: tx },
        );
      }
      await r.destroy({ transaction: tx });
    }
    // One notice per owner for the whole series, not one per occurrence.
    const owners = new Set(future.map((r) => r.made_by));
    for (const owner of owners) {
      await Notification.create(
        {
          user_id: owner,
          title: "Reservation series deleted",
          description:
            `${future.length} future reservation(s) of a series for project ${project?.name} were deleted` +
            `${owner === user.id ? " by you" : " by another user"}; ${refunded} ms were refunded.`,
        },
        { transaction: tx },
      );
    }
  });

  logToDatabase({
    userId: user.id,
    action: "delete",
    resource: "reservations",
    description: `Reservation series ${seriesId}: ${future.length} future reservation(s) of project ${project?.name} (${project?.id}) deleted by ${user.email}, ${refunded} ms refunded`,
  });
  logger.info(
    `reservation series ${seriesId}: deleted ${future.length}, refunded ${refunded}`,
  );
  return {
    series_id: seriesId,
    deleted: future.length,
    refunded_ms: refunded,
    kept_past: past,
  };
}
