import { Op, Order } from "sequelize";
import { Project, Tag } from "../models/index.ts";

/**
 * Tags are a controlled vocabulary: the rows here are created by platform
 * admins, and a project can only be given tags that already exist. Nothing in
 * this repository creates a tag as a side effect of assigning one.
 */

export const getList = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  const ids = filter.ids;
  delete filter.ids;
  const where: Record<string, unknown> = { ...filter };
  if (Array.isArray(ids) && ids.length) {
    where.id = { [Op.in]: ids };
  }
  return Tag.findAndCountAll({
    where,
    limit,
    offset,
    order: order ?? [["name", "ASC"]],
  });
};

export const getOne = (id: number) => Tag.findByPk(id);

export const getByName = (name: string) => Tag.findOne({ where: { name } });

export const create = (name: string) => Tag.create({ name });

export const update = async (id: number, name: string) => {
  await Tag.update({ name }, { where: { id } });
  return getOne(id);
};

export const destroy = (id: number) => Tag.destroy({ where: { id } });

/** How many projects carry this tag — the check that keeps a used tag alive. */
export const countProjects = async (id: number) => {
  const tag = await Tag.findByPk(id);
  if (!tag) return 0;
  return (await tag.getProjects()).length;
};

/** The subset of `ids` that actually exist, for validating an assignment. */
export const existingIds = async (ids: number[]) => {
  const rows = await Tag.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ["id"],
    raw: true,
  });
  return rows.map((row) => row.id);
};

export const getForProject = async (projectId: number) => {
  const project = await Project.findByPk(projectId);
  if (!project) return [];
  const tags = await project.getTags({ joinTableAttributes: [] });
  return tags.map((tag) => ({ id: tag.id, name: tag.name }));
};

/** Replaces a project's tags wholesale — the association is the whole value. */
export const setForProject = async (projectId: number, ids: number[]) => {
  const project = await Project.findByPk(projectId);
  if (!project) return null;
  await project.setTags(ids);
  return getForProject(projectId);
};
