import CustomError from "config/CustomError.ts";
import * as repo from "../repositories/reservation.repository.ts";
import * as slotRepo from "../repositories/slot.repository.ts";
import * as projectRepo from "../repositories/project.repository.ts";
import * as organizationRepo from "../repositories/organization.repository.ts";
import * as budgetEventRepo from "../repositories/budgetEvent.repository.ts";
import * as userRepo from "../repositories/user.repository.ts";
import { logToDatabase } from "utils/index.ts";
import { Notification, transactionManager } from "models/index.ts";
import logger from "config/logger.ts";
import { verifyDates } from "utils/checks.ts";
import { MINIMUM_SLOT_DURATION } from "config/constants.ts";
import { CreateReservationDto } from "schemas/reservation.schema.ts";
import { policy } from "config/policy.ts";
import { Order } from "sequelize";
import { AuthUser } from "../types/auth.ts";

export async function create(data: CreateReservationDto, user: AuthUser) {
  // TODO: validation
  // TODO: check if slot is already reserved
  //const day = new Date(data.day);
  const start = new Date(data.start);
  const end = new Date(data.end);

  if (!user.administeredProjects.includes(data.project_id)) {
    throw new CustomError({ statusCode: 403, message: "Unauthorized" });
  }

  try {
    verifyDates(data, MINIMUM_SLOT_DURATION);
  } catch (err) {
    throw new CustomError({ statusCode: 400, message: String(err) });
  }
  if (await repo.isSlotAlreadyBusy(start, end)) {
    throw new CustomError({
      statusCode: 400,
      message: "The reservation is overlapping another reservation",
    });
  }

  const project = await projectRepo.getOne(data.project_id);

  if (!project) {
    throw new CustomError({ statusCode: 400, message: "Project not found" });
  }

  if (project.start_at && project.start_at > start) {
    throw new CustomError({
      statusCode: 400,
      message: "Project not yet started at selected time",
    });
  }

  if (project.end_at && project.end_at < end) {
    throw new CustomError({
      statusCode: 400,
      message: "Project already expired at selected time",
    });
  }

  // Slot handling depends on the deployment policy: with
  // SLOT_CONSTRAINED_RESERVATIONS=true (default) a reservation must live
  // inside a slot of the project's organization; with the flag off,
  // reservations are placed freely and slot_id may be omitted.
  let slot = null;
  if (data.slot_id == null) {
    if (policy.slotConstrainedReservations) {
      throw new CustomError({
        statusCode: 400,
        message:
          "slot_id is required (this deployment constrains reservations to pre-allocated slots)",
      });
    }
  } else {
    slot = await slotRepo.getOne(data.slot_id);
    if (!slot)
      throw new CustomError({ statusCode: 400, message: "slot not found" });

    const projectOrganization = await organizationRepo.getOne(
      project.organization_id,
    );

    if (
      slot?.organization_id !== project.organization_id &&
      slot?.organization_id !== projectOrganization?.reference_organization_id
    ) {
      throw new CustomError({
        statusCode: 400,
        message: "Selected slot is not assigned to the same organization",
      });
    }

    // TODO: verify
    if (new Date(slot.start) > start || new Date(slot.end) < end) {
      throw new CustomError({
        statusCode: 400,
        message: "Reservation is outside selected slot",
      });
    }
  }

  let milliSeconds = 0;

  milliSeconds = end.getTime() - start.getTime(); /// 1000;
  if (milliSeconds > Number(project.remaining_budget)) {
    throw new CustomError({
      statusCode: 400,
      message: `Insufficient budget (requested: ${milliSeconds}, available: ${project.remaining_budget})`,
    });
  }

  return transactionManager.withTransaction(async (tx) => {
    project.remaining_budget = Number(project.remaining_budget) - milliSeconds;

    try {
      await project.save({ transaction: tx });
    } catch (err) {
      logger.error("Error saving project: ", err);
      throw err;
    }

    //try {
    const reservation = await repo.create(
      {
        slot_id: slot ? slot.id : null,
        made_by: user.id,
        day: slot
          ? new Date(slot.day)
          : new Date(start.toISOString().split("T")[0]),
        start,
        end,
        description: project.name + " " + (data.description || ""),
        project_id: project.id,
      },
      { transaction: tx },
    );
    //} catch (err) {
    //console.log(err);
    //}

    await budgetEventRepo.create(
      {
        project_id: project.id,
        value: -milliSeconds,
        description: `reservation ${reservation.id} (${reservation.day} ${reservation.start} - ${reservation.end})`,
        billing: true,
        user_id: user.id,
      },
      { transaction: tx },
    );

    logToDatabase({
      userId: user.id,
      action: "create",
      resource: "reservations",
      description: `Reservation ${reservation.id} (${reservation.day}: ${reservation.start} - ${reservation.end}) created by user ${user.email} (${user.sub})`,
    });

    return reservation;
  });
}

export const getList = async (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  return repo.getList(filter, limit, offset, order);
};

export async function getOne(id: number) {
  const reservation = await repo.getOne(id);
  if (!reservation) {
    throw new CustomError({
      statusCode: 404,
      message: `Not found`,
    });
  }
  return reservation;
}

/**
 * How much of a reservation's cost comes back when it is deleted: all of it
 * more than 24 hours ahead, a quarter of it closer than that. Shared by single
 * deletes and series deletes, so a series refunds exactly what deleting its
 * occurrences one by one would have.
 */
export const refundFor = (start: Date, end: Date, now: Date): number => {
  const cost = end.getTime() - start.getTime();
  const hoursAhead = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursAhead > 24 ? cost : Math.round(cost / 4);
};

export const destroy = async (id: number, user: AuthUser) => {
  const record = await repo.getOne(id);
  if (!record) {
    throw new CustomError({ statusCode: 404, message: "Not found" });
  }

  const project = await projectRepo.getOne(record.project_id);

  let authorized = false;
  if (user.roles.includes("admin")) authorized = true;

  if (
    user.roles.includes("organization-manager") &&
    user.organization.id == project?.organization_id
  )
    authorized = true;
  if (
    user.roles.includes("project-admin") &&
    project != null &&
    user.administeredProjects.includes(project.id)
  )
    authorized = true;

  if (!authorized) {
    throw new CustomError({ statusCode: 403, message: "Unauthorized" });
  }

  const now = new Date();

  if (new Date(record.start) < now) {
    throw new CustomError({
      statusCode: 400,
      message: "Cannot delete past reservations",
    });
  }

  const refund = refundFor(new Date(record.start), new Date(record.end), now);

  logToDatabase({
    userId: user.id,
    action: "delete",
    resource: "reservations",
    resourceId: record.id,
    description: `User ${user.email} deleted reservation on ${record.day} (${record.start} - ${record.end}) for project ${project?.name} (${project?.id}) - refunded ${refund}`,
  });

  return transactionManager.withTransaction(async (tx) => {
    if (project) {
      project.remaining_budget = Number(project.remaining_budget) + refund;
      await project.save({ transaction: tx });
      await budgetEventRepo.create(
        {
          project_id: project.id,
          value: refund,
          description: `reservation deleted ${record.id} (${record.day} ${record.start} - ${record.end})`,
          billing: true,
          user_id: user.id,
        },
        { transaction: tx },
      );
    }

    const reservationOwner = await userRepo.getOne(record.made_by);

    // notify user
    if (reservationOwner) {
      let description = "";

      description =
        record.made_by == user.id
          ? `your reservation ${record.description} was deleted by you and ${refund} ms were refunded to project ${project?.name}`
          : `your reservation ${record.description} was deleted by another user and ${refund} ms were refunded to project ${project?.name}`;

      // TODO: use Notification Repo
      await Notification.create(
        {
          user_id: record.made_by,
          title: "Reservation deleted",
          description,
        },
        { transaction: tx },
      );
    } else {
      logger.warn(`User not found`);
    }

    return record.destroy();
  });
};
