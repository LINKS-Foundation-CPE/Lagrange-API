import { Order } from "sequelize";
import * as repo from "repositories/job.repository.ts";
import CustomError from "config/CustomError.ts";
import { AuthUser } from "../types/auth.ts";

export const getList = async (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  return repo.getList(filter, limit, offset, order);
};

export const getOne = async (id: number) => {
  const record = repo.getOne(id);

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  return record;
};

export const getMetrics = async () => {
  const [jobCounts, total] = await Promise.all([
    repo.getStatusList(),
    repo.getCount(),
  ]);

  const result = {
    total,
    ...jobCounts.reduce((acc: Record<string, number>, { status, count }) => {
      const key = status ?? "unknown";
      acc[key] = parseInt(count);
      return acc;
    }, {}),
  };
  return result;
};
