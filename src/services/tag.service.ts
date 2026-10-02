import CustomError from "config/CustomError.ts";
import * as repo from "../repositories/tag.repository.ts";
import * as projectRepo from "../repositories/project.repository.ts";
import { Order } from "sequelize";

/**
 * The tag vocabulary.
 *
 * Admins own the list; project admins own which of those tags their own
 * projects carry. The split is why assignment lives on the project sub-resource
 * and not on tag update.
 */

export const getList = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => repo.getList(filter, limit, offset, order);

export const getOne = async (id: number) => {
  const record = await repo.getOne(id);
  if (!record)
    throw new CustomError({ statusCode: 404, message: `#${id} not found` });
  return record;
};

export const create = async (name: string) => {
  const existing = await repo.getByName(name);
  if (existing)
    throw new CustomError({
      statusCode: 409,
      message: `tag "${name}" already exists`,
    });
  return repo.create(name);
};

export const update = async (id: number, name: string) => {
  await getOne(id);
  const existing = await repo.getByName(name);
  if (existing && existing.id !== id)
    throw new CustomError({
      statusCode: 409,
      message: `tag "${name}" already exists`,
    });
  return repo.update(id, name);
};

/**
 * Deleting a tag that projects still carry is refused rather than cascaded.
 * Silently stripping a label off a set of projects is not something an admin
 * can undo, or even notice; unassigning them first is explicit.
 */
export const destroy = async (id: number) => {
  const record = await getOne(id);
  const inUse = await repo.countProjects(id);
  if (inUse > 0)
    throw new CustomError({
      statusCode: 409,
      message: `tag "${record.name}" is assigned to ${inUse} project(s); remove it from them first`,
    });
  await repo.destroy(id);
  return record;
};

export const getForProject = async (projectId: number) => {
  const project = await projectRepo.getOne(projectId);
  if (!project)
    throw new CustomError({
      statusCode: 404,
      message: `project #${projectId} not found`,
    });
  return repo.getForProject(projectId);
};

/**
 * Replaces a project's tags. Every id must already be in the vocabulary: an
 * unknown one is a 400 rather than a new tag, which is the whole point of the
 * vocabulary being admin-defined.
 */
export const setForProject = async (projectId: number, ids: number[]) => {
  const project = await projectRepo.getOne(projectId);
  if (!project)
    throw new CustomError({
      statusCode: 404,
      message: `project #${projectId} not found`,
    });

  const unique = [...new Set(ids)];
  if (unique.length) {
    const known = await repo.existingIds(unique);
    const unknown = unique.filter((id) => !known.includes(id));
    if (unknown.length)
      throw new CustomError({
        statusCode: 400,
        message: `unknown tag id(s): ${unknown.join(", ")}`,
      });
  }

  return repo.setForProject(projectId, unique);
};
