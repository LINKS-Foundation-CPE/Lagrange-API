import { Op, Order } from "sequelize";
import CustomError from "config/CustomError.ts";
import * as repo from "repositories/project.repository";
import * as userRepo from "repositories/user.repository";
import * as projectsUsersRepo from "repositories/projects_users.repository";
import * as organizationRepo from "repositories/organization.repository";
import * as budgetEventRepo from "repositories/budgetEvent.repository.ts";
import { CreateProjectDto, UpdateProjectDto } from "schemas/project.schema";
import {
  Organization,
  ProjectUser,
  User,
  transactionManager,
} from "models/index.ts";
import { logToDatabase } from "utils/index.ts";
import { AuthUser } from "../types/auth.ts";

// User with its ProjectUser join-table record eagerly loaded.
type UserWithProjectUser = User & { ProjectUser: ProjectUser };

export const getList = async (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  // Free-text search on the project name, the same `q` the user list already
  // accepts. **Substring, not prefix**: project names here carry a convention
  // — the distinguishing part is rarely at the front — so anchoring the match
  // would make the search useless for the way they are actually named.
  if (filter.q) {
    const q = String(filter.q);
    delete filter.q;
    filter.name = { [Op.iLike]: `%${q}%` };
  }

  if (filter.administrable) {
    delete filter.administrable;
    if (user.roles.includes("admin"))
      return repo.getList(user, filter, limit, offset, order);
    if (user.roles.includes("organization-manager")) {
      filter.organization_id = user.organization.id;
      return repo.getList(user, filter, limit, offset, order);
    }
    filter.ids = user.administeredProjects;
  }

  return repo.getList(user, filter, limit, offset, order);
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

export const create = async (data: CreateProjectDto, user: AuthUser) => {
  // TODO: validate dates
  const {
    name,
    organization_id,
    start_at,
    end_at,
    free_queue,
    budget = 0,
  } = data;

  return transactionManager.withTransaction(async (tx) => {
    // set initial budget
    let vaultProject = null;
    if (budget > 0) {
      // check if enough budget is available
      const organization = await organizationRepo.getOne(organization_id);
      vaultProject = await repo.getOne(organization!.vault_project_id);
      if (Number(vaultProject!.remaining_budget) < budget) {
        throw new CustomError({
          statusCode: 400,
          message: `Insufficient budget: requested ${budget}, available ${vaultProject?.remaining_budget}`,
        });
      }
    }

    const project = await repo.create(
      {
        name,
        organization_id,
        start_at: start_at ? new Date(start_at) : null,
        end_at: end_at ? new Date(end_at) : null,
        free_queue: free_queue ?? false,
        remaining_budget: budget,
      },
      { transaction: tx },
    );

    logToDatabase({
      userId: user.id,
      action: "create",
      resource: "project",
      description: `Project ${name} (${project.id}) created by ${user.email} (${user.sub}) with initial budget: ${budget}`,
    });

    // update budgets
    if (budget > 0) {
      await budgetEventRepo.create(
        {
          project_id: vaultProject!.id,
          value: -budget,
          description: `${budget} transferred to new project ${name} (${project.id})`,
          billing: false,
        },
        { transaction: tx },
      );
      await budgetEventRepo.create(
        {
          project_id: project.id,
          value: budget,
          description: `${budget} transferred from ${vaultProject!.name} (${vaultProject!.id})`,
          billing: false,
        },
        { transaction: tx },
      );

      // update vault project budget
      vaultProject!.remaining_budget =
        Number(vaultProject!.remaining_budget) - budget;
      await vaultProject!.save({ transaction: tx });

      logToDatabase({
        userId: user.id,
        action: "transaction",
        resource: "budgetEvents",
        description: `${budget} transferred from project ${vaultProject!.name} (${vaultProject!.id}) to project ${name} (${project.id}) by ${user.email} (${user.sub})`,
      });
    }

    return project;
  });
};

export const update = async (id: number, data: UpdateProjectDto) => {
  const record = await repo.getOne(id);
  const { name, organization_id, start_at, end_at, free_queue } = data;

  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: `#${id} not found`,
    });

  // check if free_queue changed status
  if (free_queue !== undefined && free_queue !== record.free_queue) {
    throw new Error("Cannot change project free queue status");
  }

  // check if organization changed
  if (
    organization_id !== undefined &&
    organization_id !== record.organization_id
  ) {
    throw new Error("Cannot change project's organization");
  }

  return repo.update(id, {
    name,
    organization_id,
    start_at: start_at ? new Date(start_at) : null,
    end_at: end_at ? new Date(end_at) : null,
    free_queue: free_queue ?? false,
  });
};

export const getUserList = async (
  user: AuthUser,
  id: number,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  const project = await repo.getOne(id);

  if (!project) {
    throw new CustomError({ statusCode: 404, message: "Project not found" });
  }

  // TODO: should not call getUsers directly but query repo?
  const users = await project.getUsers({
    where: filter,
    limit,
    offset,
    order,
    attributes: ["id", "organization_id", "email"],
    //joinTableAttributes: ['role_id'],             // join table fields
  });

  const flatUsers = (users as UserWithProjectUser[]).map((user) => ({
    id: user.ProjectUser.id,
    organization_id: user.organization_id,
    email: user.email,
    admin: user.ProjectUser.admin,
    //role_id: user.ProjectUser?.role_id ?? null,
  }));

  const count = await project.countUsers();

  return { rows: flatUsers, count };
};

export const getTransactionList = async (
  user: AuthUser,
  id: number,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  const project = await repo.getOne(id);

  if (!project) {
    throw new CustomError({ statusCode: 404, message: "Project not found" });
  }

  // TODO: should not call getBudgetEvents directly but query repo?
  const records = await project.getBudgetEvents({
    where: filter,
    limit,
    offset,
    order,
    attributes: ["id", "date", "value", "description", "user_id"],
    // The identity travels with the row rather than as a reference the client
    // resolves: the table shows one line per transaction and would otherwise
    // fetch a user per distinct id, and a project admin may read this endpoint
    // without necessarily being able to read /api/users.
    include: [
      { model: User, as: "user", attributes: ["id", "email"], required: false },
    ],
    joinTableAttributes: [], // join table fields
  });

  const count = await project.countBudgetEvents();

  return { rows: records, count };
};

export const getJobList = async (
  user: AuthUser,
  id: number,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  const project = await repo.getOne(id);

  if (!project) {
    throw new CustomError({ statusCode: 404, message: "Project not found" });
  }

  // TODO: should not call getBudgetEvents directly but query repo?
  const records = await project.getJobs({
    where: filter,
    limit,
    offset,
    order,
    //attributes: ["id", "date", "value", "description"],
    joinTableAttributes: [], // join table fields
  });

  const count = await project.countJobs();

  return { rows: records, count };
};

export const addUser = async (
  user: AuthUser,
  id: number,
  data: { email: string; admin?: boolean },
) => {
  const project = await repo.getOne(id);

  if (!project) {
    throw new CustomError({ statusCode: 404, message: "Project not found" });
  }

  const userToAdd = await userRepo.getByEmail(data.email);

  if (!userToAdd) {
    throw new CustomError({ statusCode: 400, message: "User not found" });
  }

  await project.addUser(userToAdd, { through: { admin: data.admin ?? false } });
  return { id: user.id };
};

export const updateProjectUser = async (
  user: AuthUser,
  id: number,
  data: { admin: boolean },
) => {
  // TODO: add checks
  // TODO: add notifications and logs
  const record = await projectsUsersRepo.getOne(id);
  if (!record)
    throw new CustomError({
      statusCode: 404,
      message: "ProjectUser record not found",
    });

  record.admin = data.admin;
  return record.save();
};

export const deleteProjectUser = async (user: AuthUser, id: number) => {
  // TODO: verify if user is project admin
  // TODO: add logs etc
  return projectsUsersRepo.destroy(id);
};
