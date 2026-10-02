import {
  Op,
  InferCreationAttributes,
  Optional,
  InferAttributes,
  Order,
} from "sequelize";
import { Organization, Slot, Transaction } from "../models/index.ts";
import { mapFilterToSequelize } from "utils/query.ts";

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

  return Slot.findAndCountAll({
    where,
    limit,
    offset,
    order,
    include: [
      {
        model: Organization,
        required: false,
      },
    ],
  });
};

export const getOne = (id: number) => Slot.findByPk(id);

export const create = (
  data: Optional<InferCreationAttributes<Slot>, "id">,
  options?: { transaction?: Transaction },
) => Slot.create(data, options);

export const update = async (
  id: number,
  data: Optional<InferAttributes<Slot>, "id">,
) => {
  const record = await Slot.findByPk(id);

  if (!record) return null;

  return record.update(data);
};

export const isSlotAlreadyBusy = async (start: Date, end: Date, id = 0) => {
  const overlappingSlots = await Slot.findAll({
    where: {
      id: { [Op.ne]: id },
      [Op.and]: [{ start: { [Op.lt]: end } }, { end: { [Op.gt]: start } }],
    },
  });

  return overlappingSlots.length > 0;
};

/**
 * The slot, among these organizations', that covers the whole of
 * `[start, end]` — where a reservation for that window may be placed.
 */
export const findCovering = (
  organizationIds: number[],
  start: Date,
  end: Date,
) =>
  Slot.findOne({
    where: {
      organization_id: { [Op.in]: organizationIds },
      start: { [Op.lte]: start },
      end: { [Op.gte]: end },
    },
    order: [["start", "ASC"]],
  });

export const getSlotByTime = (day: string, time: Date) => {
  return Slot.findOne({
    where: {
      day,
      start: { [Op.lte]: time },
      end: { [Op.gte]: time },
    },
  });
};

export const getCurrentSlot = () => {
  const now = new Date();

  const day = now.toISOString().split("T")[0]; // 'YYYY-MM-DD'
  const time = now.toTimeString().split(" ")[0]; // 'HH:mm:ss'
  return getSlotByTime(day, now);
};

export const getSlotReservations = async (id: number) => {
  const slot = await Slot.findByPk(id);
  return slot?.getReservations();
};
