import {
  InferCreationAttributes,
  Optional,
  Order,
  Transaction,
} from "sequelize";
import { BudgetEvent } from "../models/index.ts";

export async function create(
  // `user_id` is optional the same way `id` and `date` are: most transactions
  // have no user behind them — a vault being funded, a project created with a
  // budget — and the ones that do pass it explicitly.
  data: Optional<
    InferCreationAttributes<BudgetEvent>,
    "id" | "date" | "user_id"
  >,
  options?: { transaction: Transaction },
) {
  return BudgetEvent.create(data, options);
}

export async function getList(
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) {
  return BudgetEvent.findAndCountAll({ where: filter, limit, offset, order });
}

export async function getOne(id: number) {
  return BudgetEvent.findByPk(id);
}
