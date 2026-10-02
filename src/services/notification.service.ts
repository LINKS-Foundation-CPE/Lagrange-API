import { Order } from "sequelize";
import CustomError from "config/CustomError.ts";
import * as repo from "../repositories/notification.repository.ts";
import { AuthUser } from "../types/auth.ts";
//import { CreateAnnouncementDto } from "schemas/announcement.schema.ts";

/**
 * The caller's own notifications, always — platform admins included.
 *
 * A notification belongs to one person. `restrictToUser` deliberately exempts
 * admins so the "All Jobs" view can list every user's jobs, and that exemption
 * applied here too: since every login writes a notification, an admin's list
 * and app-bar bell filled up with other people's. "Mark all as read" then
 * tried to mark rows it did not own and got a 403 from `updateRead` on the
 * first one, which is correct but made the whole action fail.
 *
 * Scoping here rather than in the route means no filter from the query string
 * can widen it either.
 */
export const getList = async (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  if (!user.id) {
    throw new CustomError({ statusCode: 400, message: "User has no id" });
  }
  return repo.getList({ ...filter, user_id: user.id }, limit, offset, order);
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

export const getOne = async (id: number, user: AuthUser) => {
  const record = await repo.getOne(id);

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  if (record.user_id !== user.id) {
    throw new CustomError({ statusCode: 403, message: "Unauthorized" });
  }

  return record;
};

export const updateRead = async (id: number, user: AuthUser) => {
  const record = await repo.getOne(id);

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  if (record.user_id !== user.id) {
    throw new CustomError({ statusCode: 403, message: "Unauthorized" });
  }

  return repo.updateRead(id);
};

// export const create = async (data: CreateAnnouncementDto, user: unknown) => {
//   let start = null;
//   let end = null;
//   if (data.start) start = new Date(data.start);
//   if (data.end) end = new Date(data.end);
//   return repo.create({ ...data, start, end, made_by: user.id });
// };

// export const update = async (
//   id: number,
//   data: CreateAnnouncementDto,
//   user: unknown,
// ) => {
//   const record = await repo.getOne(id);

//   if (!record)
//     throw new CustomError({
//       statusCode: 404,
//       message: `#${id} not found`,
//     });

//   let start = null;
//   let end = null;
//   if (data.start) start = new Date(data.start);
//   if (data.end) end = new Date(data.end);

//   return repo.update(id, { ...data, start, end, made_by: user.id });
// };

export const destroy = async (id: number, user: AuthUser) => {
  const record = await repo.getOne(id);

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  return record.destroy();
};
