import {
  InferCreationAttributes,
  Optional,
  Order,
  Transaction,
  fn,
  col,
} from "sequelize";
import { Job } from "../models/index.ts";

export async function create(
  data: Optional<InferCreationAttributes<Job>, "id">,
  options?: { transaction: Transaction },
) {
  return Job.create(data, options);
}

export async function getList(
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) {
  return Job.findAndCountAll({ where: filter, limit, offset, order });
}

export async function getOne(id: number) {
  return Job.findByPk(id);
}

export async function getByJobid(id: string) {
  return Job.findOne({
    where: {
      jobid: id,
    },
  });
}

export async function getCount() {
  return Job.count();
}

export async function getStatusList() {
  return Job.findAll({
    attributes: ["status", [fn("COUNT", col("id")), "count"]],
    group: ["status"],
    raw: true,
  }) as unknown as { status: string | null; count: string }[];
}
