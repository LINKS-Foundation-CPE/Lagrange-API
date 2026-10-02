import { Request } from "express";
import * as userRepo from "../repositories/user.repository.ts";
import * as slotRepo from "../repositories/slot.repository.ts";
import * as projectRepo from "../repositories/project.repository.ts";
import * as organizationRepo from "../repositories/organization.repository.ts";
import * as reservationRepo from "../repositories/reservation.repository.ts";
import CustomError from "../config/CustomError.ts";
import { policy } from "../config/policy.ts";
import { Project } from "../models/index.ts";

/**
 * Job types that need Pulse (sweep) access.
 *
 * The vendor plugin classifies the request and the gateway forwards its verdict
 * as `job_type`; for IQM that is `circuit` or `sweep`, and only the sweep path
 * is privileged. A request that carries no `job_type` is treated as the
 * ordinary circuit path, which is what a gateway older than this field sends —
 * so the two sides can be deployed in either order without a window where
 * everything is refused.
 */
const PULSE_JOB_TYPES = new Set(["sweep"]);

export const authorizeJob = async (req: Request) => {
  // first search user by sub
  let user = await userRepo.getBySub(req.user.sub);
  // if not found, search user by email (user inserted but not yet logged in)
  if (!user) {
    user = await userRepo.getByEmail(req.user.email);
    if (!user) {
      throw new CustomError({
        statusCode: 403,
        message: "user not found in database",
      });
    }
    // update user with sub
    // NOTE: `req.sub` is not populated anywhere; preserved as-is (typed cast
    // only) to avoid changing existing runtime behaviour.
    await userRepo.updateSub(user.id, req.sub as string);
  }

  // Pulse access, checked here rather than only at the gateway. The gateway
  // decides it from a realm role in the token, which leaves out the principals
  // whose tokens carry no roles at all, and leaves an administrator unable to
  // revoke access without editing the identity provider. `users.pulla_user` is
  // the platform's own record of the grant — mirrored from the identity
  // provider at login, and settable by an administrator — so it is the thing to
  // ask. It is a property of the user, not of the project, so it is answered
  // before any project is resolved.
  const jobType =
    typeof req.body?.job_type === "string" ? req.body.job_type : undefined;
  if (jobType && PULSE_JOB_TYPES.has(jobType) && !user.pulla_user) {
    throw new CustomError({
      statusCode: 403,
      message: `User '${user.email}' does not have pulse access`,
    });
  }

  let project: Project | null = null;

  // get project from metadata
  if (req?.body?.project_name) {
    project = await projectRepo.getByName(req.body.project_name);
    if (!project) {
      throw new CustomError({
        statusCode: 403,
        message: `Project '${req.body.project_name}' not found`,
      });
    }
    // TODO: should call repo instead of calling directly hasUser on project?
    const isMember = await project.hasUser(user);
    if (!isMember) {
      throw new CustomError({
        statusCode: 403,
        message: `User '${user.email}' is not member of project ${req.body.project_name}`,
      });
    }
  } else {
    // chack if we are in a reservation and user is part of it
    const currentReservation = await reservationRepo.getCurrentReservation();
    if (currentReservation) {
      project = await projectRepo.getByIdAndUser(
        currentReservation.project_id,
        user.id,
      );
      if (project) {
        return true;
      }
    }

    // if no project in metadata, check default project
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

  // verify is project is active (already started and not yesy ended)
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

  // An active reservation always takes precedence: only the reserving
  // project may submit while it lasts. Checked independently of slots so
  // that reservations placed outside slots (see
  // SLOT_CONSTRAINED_RESERVATIONS=false) are enforced too.
  const currentReservation = await reservationRepo.getCurrentReservation();
  if (currentReservation) {
    if (project.id === currentReservation.project_id) {
      return true;
    }
    throw new CustomError({
      statusCode: 403,
      message: "Slot reserved to another project",
    });
  }

  // No reservation: open-queue rules. When ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS
  // is false and a pre-allocated slot is active, the queue is restricted to
  // the slot organization (or organizations referencing it).
  if (!policy.allowForeignOrgQueueInSlots) {
    const currentSlot = await slotRepo.getCurrentSlot();
    if (currentSlot) {
      let sameOrganization =
        user.organization_id === currentSlot.organization_id;
      if (!sameOrganization && user.organization_id) {
        const userOrganization = await organizationRepo.getOne(
          user.organization_id,
        );
        sameOrganization =
          userOrganization?.reference_organization_id ===
          currentSlot.organization_id;
      }
      if (!sameOrganization) {
        throw new CustomError({
          statusCode: 403,
          message: "Slot reserved to another organization",
        });
      }
    }
  }

  // verify if project has freeQueue flag = true or budget > 0
  if (project.free_queue || Number(project.remaining_budget) > 0) {
    return true;
  } else {
    throw new CustomError({
      statusCode: 403,
      message: `No budget available for project ${project.name}`,
    });
  }
};
