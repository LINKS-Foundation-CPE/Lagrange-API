import {
  InferAttributes,
  InferCreationAttributes,
  Op,
  Optional,
  Order,
} from "sequelize";
import { Announcement, Transaction } from "../models/index.ts";
import logger from "config/logger.ts";

export const getList = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  const showOld = filter.showOld === true || filter.showOld === "true";
  if (!showOld) {
    const today = new Date().toISOString().split("T")[0];
    //filter.start = { [Op.gte]: today };
    //delete filter.showOld;
    filter = {
      [Op.or]: [{ start: { [Op.gt]: today } }, { start: null }],
    };
  }
  delete filter.showOld;
  return Announcement.findAndCountAll({ where: filter, limit, offset, order });
};

export const getListActive = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  const now = new Date();
  return Announcement.findAndCountAll({
    limit,
    offset,
    order,

    // return announcements that are already started and not yet ended (supporting null dates)
    where: {
      [Op.and]: [
        {
          [Op.or]: [{ start: { [Op.lte]: now } }, { start: null }],
        },
        {
          [Op.or]: [{ end: { [Op.gte]: now } }, { end: null }],
        },
      ],
    },
  });
};

export const getOne = (id: number) => Announcement.findByPk(id);

export const create = (
  data: Optional<InferCreationAttributes<Announcement>, "id">,
  options?: { transaction: Transaction },
) => {
  return Announcement.create(data, options);
};

export const update = async (
  id: number,
  data: Omit<InferAttributes<Announcement>, "id">,
) => {
  const record = await Announcement.findByPk(id);
  if (!record) return null;
  return record.update(data);
};
