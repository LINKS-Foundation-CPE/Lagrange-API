import Sequelize, { Model, ModelStatic } from "sequelize";
import { DateTime, Duration } from "luxon";
import logger from "../config/logger.ts";
import { MINIMUM_SLOT_DURATION } from "../config/constants.ts";
const { Op } = Sequelize;

export const verifyReservationAttributes = (data: Record<string, unknown>) => {
  if (!data.start || !data.end) {
    throw "must include start and end";
  }

  if (!data.project_id) {
    throw "must include project";
  }

  if (!data.slot_id) {
    throw "must include slot";
  }
};

export const isOnHourOrHalfHour = (dt: DateTime): boolean => {
  return (
    (dt.minute === 0 || dt.minute === 30) &&
    dt.second === 0 &&
    dt.millisecond === 0
  );
};

export const verifyDates = (
  data: { start: string | number | Date; end: string | number | Date },
  minimumDuration: Duration,
) => {
  let start: DateTime;
  let end: DateTime;
  const now = DateTime.fromJSDate(new Date());

  try {
    start = DateTime.fromJSDate(new Date(data.start));
    end = DateTime.fromJSDate(new Date(data.end));
  } catch (err) {
    throw "Invalid date";
  }

  const diffInMinutes = end.diff(start, "minutes");

  if (start > end) {
    throw "please check start and end";
  }

  if (start < now) {
    throw "cannot modify in the past";
  }

  if (diffInMinutes < minimumDuration) {
    throw `minimum duration is: ${minimumDuration.reconfigure({ locale: "en" }).toHuman({ showZeros: false })}`;
  }

  if (!isOnHourOrHalfHour(start) || !isOnHourOrHalfHour(end)) {
    throw "start and end times must be aligned to the hour or half hour";
  }
};

export const verifyUserPermissions = (
  user: { roles?: string[] } | null | undefined,
  roles: string[],
) => {
  if (!user || !user.roles) {
    return false;
  }
  // verify if user has at least one necessary role
  const userRoles = user.roles;
  return roles.some((role) => userRoles.includes(role));
  // if (!user || !user.roles.includes('admin')) {
  //   return res.status(403).json({message: "only admins can allocate slots"})
  // }
};

export const isPastDate = (date: Date) => {
  const now = new Date();
  return date < now;
};

export const isSlotAlreadyBusy = async (
  model: ModelStatic<Model>,
  start: Date,
  end: Date,
  id: number | null = null,
) => {
  const overlappingSlots = await model.findAll({
    where: {
      id: { [Op.ne]: id },
      [Op.and]: [{ start: { [Op.lt]: end } }, { end: { [Op.gt]: start } }],
    },
  });

  return overlappingSlots.length > 0;
};
