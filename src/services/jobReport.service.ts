import CustomError from "config/CustomError.ts";
import * as repo from "../repositories/job.repository.ts";
import * as projectRepo from "../repositories/project.repository.ts";
import * as organizationRepo from "../repositories/organization.repository.ts";
import * as budgetEventRepo from "../repositories/budgetEvent.repository.ts";
import * as userRepo from "../repositories/user.repository.ts";
import * as reservationRepo from "../repositories/reservation.repository.ts";
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
      let bill: number | null = null;
      let billDescription = "";
      if (reported !== null) {
        bill = reported;
        billDescription = `Job ${job.jobid} (${job.id}) reported billable ${reported}`;
      } else if (execution_start && execution_end) {
        const start = DateTime.fromISO(execution_start);
        const end = DateTime.fromISO(execution_end);
        const duration = end.diff(start);
        bill = duration.as("milliseconds");
        billDescription = `Job ${job.jobid} (${job.id}) ${job.execution_start} - ${job.execution_end})`;
      }

      // A job-viewer deployment charges nothing: accounting lives elsewhere, so
      // the job and its timing are recorded but no budget moves.
      if (policy.jobPortalOnly && bill !== null) {
        logger.debug(
          `JOB_PORTAL_ONLY: not billing job ${jobid} (${bill}) — accounting is not this system's`,
        );
        bill = null;
      }

      // if project is not free queue AND is not inside a reservation, bill it
      if (!project.free_queue && bill !== null && !job.usedReservation) {
        project.remaining_budget = Number(project.remaining_budget) - bill;
        await project.save({ transaction: tx });
        await budgetEventRepo.create(
          {
            project_id: project.id,
            value: -bill,
            description: billDescription,
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
