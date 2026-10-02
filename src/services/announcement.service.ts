import { Order } from "sequelize";
import CustomError from "config/CustomError.ts";
import * as repo from "../repositories/announcement.repository.ts";
import { CreateAnnouncementDto } from "schemas/announcement.schema.ts";
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

export const getListActive = async (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  return repo.getListActive(filter, limit, offset, order);
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

export const create = async (data: CreateAnnouncementDto, user: AuthUser) => {
  let start = null;
  let end = null;
  if (data.start) start = new Date(data.start);
  if (data.end) end = new Date(data.end);
  return repo.create({ ...data, start, end, made_by: user.id });
};

export const update = async (
  id: number,
  data: CreateAnnouncementDto,
  user: AuthUser,
) => {
  const record = await repo.getOne(id);

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  let start = null;
  let end = null;
  if (data.start) start = new Date(data.start);
  if (data.end) end = new Date(data.end);

  return repo.update(id, { ...data, start, end, made_by: user.id });
};

export const destroy = async (id: number, user: AuthUser) => {
  const record = await repo.getOne(id);

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  return record.destroy();
};
