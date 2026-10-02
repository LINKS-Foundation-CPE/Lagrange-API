import {
  InferCreationAttributes,
  Op,
  Optional,
  Order,
  Transaction,
} from "sequelize";
import { Project, Reservation, User } from "../models/index.ts";
import { mapFilterToSequelize } from "utils/query.ts";

export const getOne = (id: number) => Reservation.findByPk(id);

export const getList = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  const showOld = filter.showOld === true || filter.showOld === "true";
  if (!showOld) {
    const today = new Date().toISOString().split("T")[0];
    filter.day_gte = today;
  }
  delete filter.showOld;

  const where = mapFilterToSequelize(filter);

  return Reservation.findAndCountAll({
    where,
    limit,
    offset,
    order,
    include: [
      {
        model: User,
        required: false,
      },
    ],
  });
};

export const create = (
  data: Optional<InferCreationAttributes<Reservation>, "id">,
  options?: { transaction?: Transaction },
) => Reservation.create(data, options);

export const getReservationByTime = (day: string, time: Date) =>
  Reservation.findOne({
    where: {
      //day,
      start: { [Op.lte]: time },
      end: { [Op.gte]: time },
    },
  });

export const getCurrentReservation = () => {
  const now = new Date();

  const day = now.toISOString().split("T")[0]; // 'YYYY-MM-DD'
  const time = now.toTimeString().split(" ")[0]; // 'HH:mm:ss'
  return getReservationByTime(day, now);
};

export const getReservationsWithProject = (
  onlyFuture: boolean,
  filterByUser: boolean,
  user?: User,
) => {
  return Reservation.findAll({
    include: [
      {
        model: Project,
        //attributes: ["id", "n"],
      },
    ],
  });
};

export const isSlotAlreadyBusy = async (start: Date, end: Date, id = 0) => {
  const overlappingSlots = await Reservation.findAll({
    where: {
      id: { [Op.ne]: id },
      [Op.and]: [{ start: { [Op.lt]: end } }, { end: { [Op.gt]: start } }],
    },
  });

  return overlappingSlots.length > 0;
};
