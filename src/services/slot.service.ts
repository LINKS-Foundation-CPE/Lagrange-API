import { Order } from "sequelize";
import { CreateSlotDto, UpdateSlotDto } from "schemas/slot.schema.ts";
import * as repo from "repositories/slot.repository.ts";
import { Reservation, transactionManager } from "models/index.ts";
import { logToDatabase } from "utils/index.ts";
import CustomError from "config/CustomError.ts";
import { isPastDate, isSlotAlreadyBusy, verifyDates } from "utils/checks.ts";
import { MINIMUM_SLOT_DURATION } from "config/constants.ts";
import { AuthUser } from "../types/auth.ts";

export const getList = async (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  // TODO: move filter up in controller
  return repo.getList(filter, limit, offset, order);
};

export const update = async (id: number, data: UpdateSlotDto) => {
  const slot = await repo.getOne(id);
  const day = new Date(data.day);
  const start = new Date(data.start);
  const end = new Date(data.end);

  if (!slot)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  try {
    verifyDates(data, MINIMUM_SLOT_DURATION);
    if (await repo.isSlotAlreadyBusy(start, end, id)) {
      throw "Selected slot is already busy";
    }
    if (isPastDate(new Date(slot.start))) {
      throw "cannot modify past allocations";
    }
    const reservations = await repo.getSlotReservations(id);

    if (reservations && reservations.length) {
      throw "Cannot modify slot as it already contains reservations";
    }
  } catch (error) {
    throw new CustomError({ statusCode: 400, message: String(error) });
  }

  // TODO: log

  const record = await repo.update(id, { ...data, day, start, end });

  return record;
};

export const create = async (data: CreateSlotDto, user: AuthUser) => {
  // TODO: move dates instantiation up in controller
  // TODO: log creation
  const day = new Date(data.day);
  const start = new Date(data.start);
  const end = new Date(data.end);
  try {
    verifyDates(data, MINIMUM_SLOT_DURATION);
    if (await repo.isSlotAlreadyBusy(start, end)) {
      throw "Selected slot is already busy";
    }
  } catch (e) {
    throw new CustomError({ statusCode: 400, message: String(e) });
  }
  return repo.create({ ...data, day, start, end });
};

export const getOne = async (id: number) => {
  const record = await repo.getOne(id);

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  return record;
};

export const destroy = async (id: number) => {
  const record = await repo.getOne(id);
  if (!record) {
    throw new CustomError({ statusCode: 404, message: "Not found" });
  }

  // check if there are attached reservations
  const count = await Reservation.count({ where: { slot_id: id } });
  if (count > 0)
    throw new CustomError({
      statusCode: 400,
      message: "Cannot delete slot because it contains reservations",
    });
  return record.destroy();
};
