import CustomError from "config/CustomError.ts";
import logger from "config/logger.ts";
import { policy } from "config/policy.ts";
import { Job, Project, transactionManager, User } from "models/index.ts";
import * as budgetEventRepo from "../repositories/budgetEvent.repository.ts";
import * as projectRepo from "../repositories/project.repository.ts";
import * as reservationRepo from "../repositories/reservation.repository.ts";
import * as userRepo from "../repositories/user.repository.ts";
import {
  AuthorizeSessionDto,
  ReportSessionDto,
} from "schemas/session.schema.ts";
import { ledgerDescription, ledgerWindow } from "../utils/ledgerTime.ts";
import { logToDatabase } from "utils/index.ts";
import { coverageFor } from "./reservationCoverage.ts";

/**
 * QPU sessions: an exclusive hold on the machine for up to a fixed time, during
 * which only the holder's jobs run (IQM calls them iterations; other vendors
 * have the same idea under other names). The gateway maps the vendor's API onto
 * the two calls here; nothing below is vendor-specific.
 *
 * The whole granted time is charged when the session opens, so the budget must
 * cover it, like a reservation. When it ends, the time it did not use is given
 * back: what stays charged is the time it was active, from start to end, idle
 * included — the machine was held for the user throughout. A session that never
 * became active (cancelled or failed while queued) gets everything back. Jobs
 * run inside a session are recorded but not charged.
 *
 * The granted time is the smaller of the request and the user's limit: the
 * user's own `session_max_seconds` if an administrator set one (which may be
 * above the deployment default), otherwise the gateway's default.
 *
 * Time covered by one of the project's own reservations is not charged again,
 * by the same rule as jobs (see `reservationCoverage`). A session that could run
 * into another project's reservation is refused: it would hold the machine
 * through time someone else has paid for.
 */

const SESSION_TERMINAL = new Set([
  "completed",
  "failed",
  "cancelled",
  "aborted",
]);

const findUser = async (username: string) => {
  const user = await userRepo.getByEmail(username);
  if (!user) {
    throw new CustomError({
      statusCode: 403,
      message: `user ${username} not found`,
    });
  }
  return user;
};

/** The project the session is billed to: the named one (if the user is in it), else the default. */
const resolveProject = async (user: User, projectName?: string | null) => {
  let project: Project | null;
  if (projectName) {
    project = await projectRepo.getByName(projectName);
    if (!project) {
      throw new CustomError({
        statusCode: 403,
        message: `Project '${projectName}' not found`,
      });
    }
    if (!(await project.hasUser(user))) {
      throw new CustomError({
        statusCode: 403,
        message: `User '${user.email}' is not member of project ${projectName}`,
      });
    }
  } else {
    if (!user.default_project_id) {
      throw new CustomError({
        statusCode: 403,
        message: "no project provided and no default project defined",
      });
    }
    project = await projectRepo.getOne(user.default_project_id);
    if (!project) {
      throw new CustomError({
        statusCode: 403,
        message: "unknown default project",
      });
    }
  }
  const now = new Date();
  if (project.end_at && project.end_at < now) {
    throw new CustomError({
      statusCode: 403,
      message: `Project '${project.name}' already expired`,
    });
  }
  if (project.start_at && project.start_at > now) {
    throw new CustomError({
      statusCode: 403,
      message: `Project '${project.name}' not yet started`,
    });
  }
  return project;
};

/** What a session over `window` costs the project: the part outside its own reservations, in ms. */
const chargeFor = async (
  project: Project,
  window: { start: Date; end: Date },
) => {
  const coverage = await coverageFor(project.id, window);
  return { coverage, charge: coverage.outsideMs };
};

export const authorizeSession = async (data: AuthorizeSessionDto) => {
  const user = await findUser(data.username);
  if (!user.session_access) {
    throw new CustomError({
      statusCode: 403,
      message: `User '${user.email}' does not have session access`,
    });
  }
  const project = await resolveProject(user, data.project_name);

  const limit = user.session_max_seconds ?? data.default_max_seconds;
  const granted = Math.min(data.requested_seconds, limit);
  const start = new Date();
  const end = new Date(start.getTime() + granted * 1000);

  const foreign = (
    await reservationRepo.getReservationsOverlapping(start, end)
  ).filter((r) => r.project_id !== project.id);
  if (foreign.length > 0) {
    throw new CustomError({
      statusCode: 403,
      message: `A session of ${granted} s would overlap a reservation of another project (${ledgerWindow(foreign[0].start, foreign[0].end)})`,
    });
  }

  const { charge } = await chargeFor(project, { start, end });
  if (
    !policy.jobPortalOnly &&
    !project.free_queue &&
    charge > Number(project.remaining_budget)
  ) {
    throw new CustomError({
      statusCode: 403,
      message: `Insufficient budget for a ${granted} s session (requested: ${charge}, available: ${project.remaining_budget})`,
    });
  }

  return {
    granted_seconds: granted,
    project_name: project.name,
    charge_ms: charge,
  };
};

export const reportSession = async (data: ReportSessionDto) => {
  const existing = await Job.findOne({ where: { jobid: data.session_id } });
  if (existing) {
    // The gateway may retry: one session, one charge.
    logger.warn(`session ${data.session_id} already recorded`);
    return existing;
  }
  const user = await findUser(data.username);
  const project = await resolveProject(user, data.project_name);
  const start = new Date(data.opened_at);
  const end = new Date(start.getTime() + data.granted_seconds * 1000);
  const { coverage, charge } = await chargeFor(project, { start, end });
  const billed = policy.jobPortalOnly || project.free_queue ? 0 : charge;

  return transactionManager.withTransaction(async (tx) => {
    const job = await Job.create(
      {
        project_id: project.id,
        organization_id: project.organization_id,
        user_id: user.id,
        jobid: data.session_id,
        status: "waiting",
        submitted_datetime: start,
        execution_start: null,
        execution_end: null,
        results: null,
        submitted_circuit: null,
        job_type: data.session_kind,
        is_session: true,
        usedReservation: coverage.insideMs > 0,
        reservation_ids: coverage.insideMs > 0 ? coverage.reservationIds : null,
        reservation_covered_ms:
          coverage.insideMs > 0 ? coverage.insideMs : null,
        // What was charged; also what a never-started session gets back.
        billable: billed,
      },
      { transaction: tx },
    );
    if (billed > 0) {
      const locked = await Project.findByPk(project.id, {
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      locked!.remaining_budget = Number(locked!.remaining_budget) - billed;
      await locked!.save({ transaction: tx });
      await budgetEventRepo.create(
        {
          project_id: project.id,
          value: -billed,
          billing: true,
          user_id: user.id,
          description: ledgerDescription(
            `Session ${data.session_kind} ${data.session_id} (${job.id}) ${data.granted_seconds} s granted (${ledgerWindow(start, end)})` +
              (coverage.insideMs > 0
                ? `; ${coverage.insideMs} ms inside reservation ${coverage.reservationIds.join(", ")} not billed`
                : ""),
          ),
        },
        { transaction: tx },
      );
    }
    logToDatabase({
      userId: user.id,
      action: "create",
      resource: "jobs",
      resourceId: job.id,
      description: `${data.session_kind} ${data.session_id} opened by ${user.email} for project ${project.name}: ${data.granted_seconds} s, charged ${billed} ms`,
    });
    return job;
  });
};

/**
 * Progress and terminal reports for a session row, from PUT /jobReport: the
 * status and the active window (`execution_start` = when it became active,
 * `execution_end` = when it ended). At the terminal report the charge is
 * settled: what stays charged is the active time outside the project's own
 * reservations, the rest of the up-front charge is refunded. Settled once —
 * `billable` then holds the final charge and `execution_end` marks it done.
 */
export const updateSession = async (
  job: Job,
  data: {
    status?: string | null;
    execution_start?: string | null;
    execution_end?: string | null;
  },
) =>
  transactionManager.withTransaction(async (tx) => {
    const settled =
      (job.execution_end !== null && job.execution_end !== undefined) ||
      (SESSION_TERMINAL.has(job.status ?? "") && !job.execution_start);
    if (data.status) job.status = data.status;
    if (data.execution_start && !job.execution_start)
      job.execution_start = new Date(data.execution_start);
    if (data.execution_end && !job.execution_end)
      job.execution_end = new Date(data.execution_end);
    const terminal = SESSION_TERMINAL.has(job.status ?? "");
    if (settled || !terminal) {
      await job.save({ transaction: tx });
      return;
    }

    const charged = Number(job.billable ?? 0);
    let due = 0;
    if (job.execution_start) {
      // Ended without a reported end: it held the machine until now.
      const end = job.execution_end ?? new Date();
      job.execution_end = end;
      const coverage = await coverageFor(
        job.project_id,
        { start: job.execution_start, end },
        tx,
      );
      due = Math.min(charged, coverage.outsideMs);
    }
    const refund = charged - due;
    if (refund > 0) {
      const project = await Project.findByPk(job.project_id, {
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      project!.remaining_budget = Number(project!.remaining_budget) + refund;
      await project!.save({ transaction: tx });
      await budgetEventRepo.create(
        {
          project_id: job.project_id,
          value: refund,
          billing: true,
          user_id: job.user_id,
          description: ledgerDescription(
            job.execution_start
              ? `Refund ${refund} ms: session ${job.job_type} ${job.jobid} (${job.id}) used ${due} ms of ${charged} charged (${ledgerWindow(job.execution_start, job.execution_end!)})`
              : `Refund ${refund} ms: session ${job.job_type} ${job.jobid} (${job.id}) ended ${job.status} without starting`,
          ),
        },
        { transaction: tx },
      );
    }
    job.billable = due;
    await job.save({ transaction: tx });
  });
