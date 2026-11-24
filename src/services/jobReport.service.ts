import CustomError from "config/CustomError.ts";
import * as repo from "../repositories/job.repository.ts";
import * as projectRepo from "../repositories/project.repository.ts";
import * as organizationRepo from "../repositories/organization.repository.ts";
import * as budgetEventRepo from "../repositories/budgetEvent.repository.ts";
import * as userRepo from "../repositories/user.repository.ts";
import * as reservationRepo from "../repositories/reservation.repository.ts";
import { Coverage, coverageFor } from "./reservationCoverage.ts";
import { ledgerDescription, ledgerWindow } from "../utils/ledgerTime.ts";
import { logToDatabase } from "utils/index.ts";
import { transactionManager } from "models/index.ts";
import logger from "config/logger.ts";
import { policy } from "config/policy.ts";
import {
  CreateJobReportDto,
  UpdateJobReportDto,
} from "schemas/jobReport.schema.ts";
import { DateTime } from "luxon";
import { User } from "models/index.ts";
import { updateSession } from "./session.service.ts";

/**
 * Create the project a job report names, for deployments where the reporter is
 * the authority on it.
 *
 * Only reached under `JOB_PORTAL_ONLY`, and only when no project of that name
 * exists. There, the accounting entity is decided elsewhere — a SLURM
 * `--account`, say, which the job reporter passes through as `project_name` —
 * and this API has no endpoint left to create projects with, so a report for
 * an unknown one would otherwise be rejected forever.
 *
 * The row is bookkeeping, not a budget: nothing is billed in this mode, so it
 * is created `free_queue` with a zero budget. That also keeps jobs working if
 * the flag is later turned off, instead of failing against an empty budget.
 *
 * The organization is the reporting user's. Falling back to the only
 * organization that exists covers the ordinary single-site deployment, where a
 * user provisioned by their first login has none yet; anything ambiguous is an
 * error rather than a guess.
 */
async function provisionReportedProject(name: string, user: User) {
  let organizationId = user.organization_id ?? null;

  if (organizationId === null) {
    const organizations = await organizationRepo.getList({});
    if (organizations.count === 1) {
      organizationId = organizations.rows[0].id;
    }
  }

  if (organizationId === null) {
    throw new CustomError({
      statusCode: 400,
      message:
        `cannot create reported project '${name}': user ${user.email} has no ` +
        `organization and the deployment does not have exactly one to fall ` +
        `back to. Assign the user an organization.`,
    });
  }

  const project = await projectRepo.create({
    name,
    organization_id: organizationId,
    free_queue: true,
    remaining_budget: 0,
  });

  logger.info(
    `created reported project '${name}' (id ${project.id}) in organization ${organizationId}`,
  );
  logToDatabase({
    userId: user.id,
    action: "create",
    resource: "projects",
    resourceId: project.id,
    description: `project ${name} created from a job report (JOB_PORTAL_ONLY)`,
  });

  return project;
}

export async function create(data: CreateJobReportDto) {
  const {
    project_name = null,
    username,
    jobid,
    status = null,
    execution_start = null,
    execution_end = null,
    submitted_datetime = new Date().toISOString(),
    results = null,
    submitted_circuit = null,
    job_type,
    session_id = null,
    session_kind = null,
  } = data;

  let start = null;
  let end = null;
  let usedReservation = false;

  const submitted = DateTime.fromISO(submitted_datetime, {
    zone: "utc",
  }).toJSDate();

  if (execution_start) {
    start = DateTime.fromISO(execution_start, {
      zone: "utc",
    }).toJSDate();
  }
  if (execution_end) {
    end = DateTime.fromISO(execution_end, {
      zone: "utc",
    }).toJSDate();
  }
  // if (submitted_datetime) {
  //   submitted = DateTime.fromISO(submitted_datetime, {
  //     zone: "utc",
  //   }).toJSDate();
  // }

  const user = await userRepo.getByEmail(username);

  logger.debug(`User: ${JSON.stringify(user)}`);

  if (!user) {
    logger.error(`user not found (${username})`);
    logToDatabase({
      userId: null,
      action: "reportingError",
      resource: "jobs",
      description: `User not found: ${username}`,
    });
    throw new CustomError({
      statusCode: 400,
      message: `user ${username} not found`,
    });
  }

  // instantiate project to user's default project
  //let project_id = user.default_project_id;
  let project = null;
  if (user.default_project_id) {
    project = await projectRepo.getOne(user.default_project_id);
  }

  logger.debug(`1. project: ${JSON.stringify(project)}`);

  // check if there is a current reservation and user is part of it
  //const submission_date = new Date(submitted_datetime);
  const day = submitted.toISOString().split("T")[0];
  const reservation = await reservationRepo.getReservationByTime(
    day,
    submitted,
  );
  //const currentReservation = await reservationRepo.getCurrentReservation();
  if (reservation) {
    project = await projectRepo.getByIdAndUser(reservation.project_id, user.id);
    usedReservation = true;
  }

  logger.debug(`currentReservation: ${JSON.stringify(reservation)}`);

  // if job was authorized, project (if defined) should exist and valid for the user
  if (project_name) {
    project = await projectRepo.getByName(project_name);
    // In job-portal-only mode the reporter is the authority on the project and
    // there is no endpoint left to pre-create it with — see above.
    if (!project && policy.jobPortalOnly) {
      project = await provisionReportedProject(project_name, user);
    }
  }

  logger.debug(`project_name: ${project_name}`);
  logger.debug(`2. project: ${JSON.stringify(project)}`);

  if (!project) {
    logToDatabase({
      userId: user.id,
      action: "reportingError",
      resource: "jobs",
      description: `project not found or user withoud default project (user: ${username}, project_name: ${project_name})`,
    });
    throw new CustomError({ statusCode: 400, message: `project not found` });
  }

  // Provisional. Whether a job ran inside its project's reservation is decided
  // when it is billed, from its execution window (see update). Until then this
  // only says the job was submitted during one, and only one of its own
  // project's: a reservation of another project covers nothing of this job.
  if (reservation && reservation.project_id !== project.id) {
    usedReservation = false;
  }

  const job = await repo.create({
    project_id: project.id,
    organization_id: project.organization_id,
    user_id: user.id,
    jobid,
    status,
    execution_start: start,
    execution_end: end,
    submitted_datetime: submitted,
    results,
    submitted_circuit,
    usedReservation,
    job_type: job_type,
    session_id,
    session_kind,
    // The creating report never bills, so there is nothing charged to record.
    billable: null,
  });

  logger.debug(`job: ${JSON.stringify(job)}`);
}

export const update = async (jobid: string, data: UpdateJobReportDto) => {
  return transactionManager.withTransaction(async (tx) => {
    try {
      const job = await repo.getByJobid(jobid);
      logger.debug(`job: ${JSON.stringify(job)}`);

      if (!job) {
        logToDatabase({
          userId: null,
          action: "reportingError",
          resource: "jobs",
          description: `jobid not found: ${jobid}`,
        });
        logger.error(`Jobid not found: ${jobid}`);
        throw new CustomError({
          statusCode: 404,
          message: `jobid ${jobid} not found`,
        });
      }

      // A session row was charged when it opened (see session.service): its
      // reports only record progress, and refund a session that never started.
      if (job.is_session) {
        await updateSession(job, data);
        return;
      }

      // A job is billed exactly once. The execution window being set has
      // always been the marker for that; a reported billable amount can arrive
      // with no timestamps at all, so it is a second, equivalent marker.
      const alreadyBilled =
        (job.execution_start && job.execution_end) ||
        (job.billable !== null && job.billable !== undefined);
      if (alreadyBilled) {
        logger.warn(`job already saved (jobid - ${jobid})`);
        logToDatabase({
          userId: null,
          action: "reportingWarning",
          resource: "jobs",
          description: `job already saved: jobid - ${jobid}`,
        });
        return;
      }

      const {
        status = null,
        execution_start = null,
        execution_end = null,
        submitted_datetime = null,
        results = null,
        submitted_circuit = null,
        billable = null,
      } = data;

      // Opt-in: the reporter states what to charge, in the deployment's own
      // billing unit, and the operator is responsible for that unit matching
      // the project budgets. Off by default, so nothing changes for a
      // deployment that bills the execution window.
      let reported: number | null = null;
      if (billable !== null && billable !== undefined) {
        if (policy.acceptReportedBilling) {
          reported = billable;
        } else {
          logger.warn(
            `job ${jobid} reported billable=${billable} but ACCEPT_REPORTED_BILLING is off: ignoring it and billing the execution window`,
          );
        }
      }

      if (status) {
        job.status = status;
      }
      if (execution_start) {
        job.execution_start = DateTime.fromISO(execution_start, {
          zone: "utc",
        }).toJSDate();
      }
      if (execution_end) {
        job.execution_end = DateTime.fromISO(execution_end, {
          zone: "utc",
        }).toJSDate();
      }
      if (submitted_datetime) {
        job.submitted_datetime = DateTime.fromISO(submitted_datetime, {
          zone: "utc",
        }).toJSDate();
      }
      if (results) {
        job.results = results;
      }
      if (submitted_circuit) {
        job.submitted_circuit = submitted_circuit;
      }
      if (reported !== null) {
        job.billable = reported;
      }

      // Reservation coverage, from when the job EXECUTED. The flag set at
      // submission only says it was submitted during a reservation: a job
      // queued just before one runs inside it, and was billed for time the
      // reservation had already paid. With an execution window, the window
      // decides, against this job's own project's reservations only.
      let coverage: Coverage | null = null;
      if (job.execution_start && job.execution_end) {
        coverage = await coverageFor(
          job.project_id,
          { start: job.execution_start, end: job.execution_end },
          tx,
        );
        job.usedReservation = coverage.insideMs > 0;
        // Which reservations, and how much: what the job list shows as
        // "billed as part of reservation N". Recomputed on every terminal
        // report, like the flag.
        job.reservation_ids =
          coverage.insideMs > 0 ? coverage.reservationIds : null;
        job.reservation_covered_ms =
          coverage.insideMs > 0 ? coverage.insideMs : null;
      }

      await job.save({ transaction: tx });

      const project = await projectRepo.getOne(job.project_id);

      // shoud not happen
      if (!project) {
        logToDatabase({
          userId: null,
          action: "reportingWarning",
          resource: "jobs",
          description: `project not found - ${job.project_id}`,
        });
        throw new CustomError({
          statusCode: 500,
          message: `project not found`,
        });
      }

      // let reservation = null;

      // if (job.execution_start) {
      //   reservation = reservationRepo.getReservationByTime(
      //     "",
      //     job.execution_start,
      //   );
      // }

      // What to charge: the reported amount when the deployment supplies one,
      // otherwise the execution window in milliseconds as always. Computed
      // before the free-queue/reservation check so both paths share it.
      //
      // Only the part of the execution outside the project's reservations is
      // billed: a job wholly inside one costs nothing more, a job straddling
      // either edge of one is charged for the part outside it. A reported
      // amount is scaled by the same fraction. Without an execution window
      // there is nothing to measure, and the submission-time flag decides, as
      // it always has.
      let bill: number | null = null;
      let billDescription = "";
      const window =
        job.execution_start && job.execution_end
          ? ledgerWindow(job.execution_start, job.execution_end)
          : "";
      const split = (c: Coverage) =>
        c.insideMs > 0
          ? `; ${c.insideMs} ms inside reservation ${c.reservationIds.join(", ")} not billed, ${c.outsideMs} ms billed`
          : "";
      if (reported !== null) {
        if (coverage && coverage.durationMs > 0) {
          bill = Math.round(
            (reported * coverage.outsideMs) / coverage.durationMs,
          );
          billDescription = `Job ${job.jobid} (${job.id}) reported billable ${reported}, ${window}${split(coverage)}${coverage.insideMs > 0 ? ` (charged ${bill})` : ""}`;
        } else {
          bill = job.usedReservation ? 0 : reported;
          billDescription = `Job ${job.jobid} (${job.id}) reported billable ${reported}`;
        }
      } else if (execution_start && execution_end && coverage) {
        if (coverage.durationMs === 0) {
          logger.warn(
            `job ${jobid}: execution window is empty or ends before it starts (${execution_start} - ${execution_end}); nothing billed`,
          );
        }
        bill = coverage.outsideMs;
        billDescription = `Job ${job.jobid} (${job.id}) ${window}${split(coverage)}`;
      }

      // A job run inside a QPU session is not charged: the session was charged
      // up front for the whole time it holds the machine.
      if (job.session_id && bill !== null) {
        logger.debug(
          `job ${jobid} ran in session ${job.session_id}: not billed`,
        );
        bill = null;
      }

      // A job-viewer deployment charges nothing: accounting lives elsewhere, so
      // the job and its timing are recorded but no budget moves.
      if (policy.jobPortalOnly && bill !== null) {
        logger.debug(
          `JOB_PORTAL_ONLY: not billing job ${jobid} (${bill}) — accounting is not this system's`,
        );
        bill = null;
      }

      // Free-queue projects are never billed; nothing is charged for time a
      // reservation already paid (bill is then 0, and no ledger row is written).
      if (!project.free_queue && bill !== null && bill > 0) {
        project.remaining_budget = Number(project.remaining_budget) - bill;
        await project.save({ transaction: tx });
        await budgetEventRepo.create(
          {
            project_id: project.id,
            value: -bill,
            description: ledgerDescription(billDescription),
            billing: true,
            // Who ran it. The description already names the job; without this
            // the person behind the charge is a second lookup away.
            user_id: job.user_id,
          },
          { transaction: tx },
        );
      }

      return;

      // TODO: update project budget if necessary
    } catch (err) {
      logger.error("Error updating JOB: ");
      logger.error(err);
      logToDatabase({
        userId: null,
        action: "reportingError",
        resource: "jobs",
        description: JSON.stringify(err),
      });
      if (err instanceof CustomError) {
        throw new CustomError({
          statusCode: err.statusCode,
          message: err.message.trim(),
        });
      } else {
        throw new CustomError({
          statusCode: 500,
          message: JSON.stringify(err),
        });
      }
    }
  });
};
