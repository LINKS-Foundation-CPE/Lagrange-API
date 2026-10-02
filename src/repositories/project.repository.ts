import {
  InferAttributes,
  InferCreationAttributes,
  Op,
  Optional,
  Order,
} from "sequelize";
import {
  Project,
  ProjectUser,
  Tag,
  Transaction,
  User,
} from "../models/index.ts";
import { AuthUser } from "../types/auth.ts";

/**
 * Tags come back with every project so a list can show them without a request
 * per row. Only id and name: the join table and the tag timestamps are noise
 * to every caller.
 */
const tagInclude = {
  model: Tag,
  attributes: ["id", "name"],
  through: { attributes: [] },
};

export const getList = (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  // return Project.findAndCountAll({
  //   include: [
  //     {
  //       model: User,
  //       where: { id: user.id },
  //       through: { attributes: [] },
  //     },
  //   ],
  // });

  const ids = filter.ids;

  delete filter.ids;

  const where: Record<string, unknown> = { ...filter };
  if (Array.isArray(ids) && ids.length) {
    where.id = { [Op.in]: ids };
  }

  return Project.findAndCountAll({
    where,
    limit,
    offset,
    order,
    include: [tagInclude],
    // A belongsToMany include multiplies rows, which would make `count` count
    // project-tag pairs instead of projects and hand react-admin a Content-Range
    // that does not match the page. `distinct` counts distinct project ids.
    distinct: true,
  });
};

// For free_queue projects, total_execution_time is the sum of all job durations in milliseconds,
// counting only jobs that ran on the shared queue (usedReservation = false) and have recorded
// both a start and end time. COALESCE handles the case where no jobs match (SUM returns NULL).
// For non-free_queue projects the field is always 0.
// ::bigint casts the result to an integer instead of decimal
export const getOne = (id: number) =>
  Project.findOne({
    where: { id },
    include: [tagInclude],
    attributes: {
      include: [
        [
          Project.sequelize!.literal(
            `CASE WHEN "project"."free_queue" = true
              THEN COALESCE((SELECT SUM(EXTRACT(EPOCH FROM ("execution_end" - "execution_start")) * 1000)::bigint
                    FROM jobs
                    WHERE project_id = "project"."id"
                    AND "usedReservation" = false
                    AND "execution_start" IS NOT NULL
                    AND "execution_end" IS NOT NULL), 0)
              ELSE 0
            END`,
          ),
          "total_freequeue_time",
        ],
      ],
    },
  });

export const create = (
  data: Optional<
    InferCreationAttributes<Project, { omit: "total_freequeue_time" }>,
    "id" | "start_at" | "end_at" | "remaining_budget"
  >,
  options?: { transaction: Transaction },
) => {
  return Project.create(data, options);
};

export const update = async (
  id: number,
  data: Partial<
    Omit<
      InferAttributes<Project>,
      "id" | "remaining_budget" | "total_freequeue_time"
    >
  >,
) => {
  const project = await Project.findByPk(id);
  if (!project) return null;
  return project.update(data);
};

export const getByName = (name: string) => {
  return Project.findOne({
    where: {
      name: name,
    },
  });
};

export const getByNameAndUser = (name: string, user: number) =>
  Project.findOne({
    where: {
      name: name,
    },
    include: [
      {
        model: User,
        where: { id: user }, // filter the join to only look for this user
        through: { attributes: [] }, // optional: hide join table fields
        required: true, // ensures that only projects with the user are returned
      },
    ],
  });

export const getByIdAndUser = (id: number, user: number) =>
  Project.findOne({
    where: {
      id: id,
    },
    include: [
      {
        model: User,
        where: { id: user }, // filter the join to only look for this user
        through: { attributes: [] }, // optional: hide join table fields
        required: true, // ensures that only projects with the user are returned
      },
    ],
  });

export const getUserProjects = async (
  user_id: number,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  return Project.findAndCountAll({
    where: filter,
    limit,
    offset,
    order,
    distinct: true,
    include: [
      {
        model: ProjectUser,
        where: { user_id: user_id },
        attributes: [],
      },
    ],
  });
};
