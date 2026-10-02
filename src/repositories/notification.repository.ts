import {
  InferAttributes,
  InferCreationAttributes,
  Op,
  Optional,
  Order,
} from "sequelize";
import { Notification, Transaction } from "../models/index.ts";

export const getList = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => Notification.findAndCountAll({ where: filter, limit, offset, order });

export const getListActive = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  return Notification.findAndCountAll({
    limit,
    offset,
    order,

    // where: {
    //   // get announcements with start < now and end > now
    //   [Op.and]: [{ start: { [Op.lte]: now } }, { end: { [Op.gte]: now } }],
    // },
  });
};

export const getOne = (id: number) => Notification.findByPk(id);

export const create = (
  data: Optional<InferCreationAttributes<Notification>, "id">,
  options?: { transaction: Transaction },
) => {
  return Notification.create(data, options);
};

export const update = async (
  id: number,
  data: Omit<InferAttributes<Notification>, "id">,
) => {
  const record = await Notification.findByPk(id);
  if (!record) return null;
  return record.update(data);
};

export const updateRead = async (id: number) => {
  const record = await Notification.findByPk(id);
  if (!record) return null;
  record.read = true;
  return record.save();
};
