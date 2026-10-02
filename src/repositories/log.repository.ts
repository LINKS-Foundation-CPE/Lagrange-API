import { Order } from "sequelize";
import { ActionLog } from "../models/index.ts";

export async function getList(
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) {
  return ActionLog.findAndCountAll({ where: filter, limit, offset, order });
}

export async function getOne(id: number) {
  return ActionLog.findByPk(id);
}
