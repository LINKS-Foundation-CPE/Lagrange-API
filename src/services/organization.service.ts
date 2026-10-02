import { Order } from "sequelize";
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from "schemas/organization.schema.ts";

import * as organizationRepo from "repositories/organization.repository.ts";
import * as projectRepo from "repositories/project.repository.ts";
import * as budgetEventRepo from "repositories/budgetEvent.repository.ts";
import { transactionManager } from "models/index.ts";
import { logToDatabase } from "utils/index.ts";
import CustomError from "config/CustomError.ts";
import { AuthUser } from "../types/auth.ts";

export const getList = async (
  user: AuthUser,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  return organizationRepo.getList(filter, limit, offset, order);
};

export const update = async (id: number, data: UpdateOrganizationDto) => {
  const organization = await organizationRepo.update(id, data);

  if (!organization)
    throw new CustomError({
      statusCode: 404,
      message: `Organization ${id} not found`,
    });

  return organization;
};

export const create = async (data: CreateOrganizationDto, user: AuthUser) => {
  const { name, reference_organization_id, initial_budget, free_queue } = data;

  // transform budget in milliseconds
  const budget = (initial_budget || 0) * 60 * 60 * 1000;

  return transactionManager.withTransaction(async (tx) => {
    const organization = await organizationRepo.create(
      { name, reference_organization_id },
      { transaction: tx },
    );
    const vault_project = await projectRepo.create(
      {
        name: `${name} Vault`,
        remaining_budget: budget,
        free_queue,
        organization_id: organization.id,
      },
      { transaction: tx },
    );

    organization.vault_project_id = vault_project.id;
    await organization.save({ transaction: tx });

    await budgetEventRepo.create(
      {
        project_id: vault_project.id,
        value: budget,
        description: `vault creation (${name}): ${initial_budget} hours`,
        billing: false,
      },
      { transaction: tx },
    );

    logToDatabase({
      userId: user.id,
      action: "create",
      resource: "organizations",
      description: `Organization ${organization.name} (${organization.id}) created by user ${user.email} (${user.sub})`,
    });

    logToDatabase({
      userId: user.id,
      action: "create",
      resource: "projects",
      description: `Vault project ${vault_project.name} (${vault_project.id}) of ${initial_budget || 0} hours created for organization ${organization.name} (${organization.id})`,
    });
    return organization;
  });
};

export const getOne = async (id: number) => {
  const org = organizationRepo.getOne(id);

  if (!org)
    throw new CustomError({
      statusCode: 404,
      message: `Organization ${id} not found`,
    });

  return org;
};

export const transferBudget = async (
  user: AuthUser,
  orgId: number,
  sourceId: number,
  destId: number,
  value: number,
) => {
  if (value < 0) {
    throw new CustomError({
      statusCode: 400,
      message: "Amount must be positive",
    });
  }

  return transactionManager.withTransaction(async (tx) => {
    const sourceProject = await projectRepo.getOne(sourceId);
    const destinationProject = await projectRepo.getOne(destId);

    if (!sourceProject || !destinationProject) {
      throw new CustomError({ statusCode: 400, message: "Project not found" });
    }

    if (
      sourceProject.organization_id !== orgId ||
      destinationProject.organization_id !== orgId
    ) {
      throw new CustomError({
        statusCode: 400,
        message: "Project is not part of organization",
      });
    }

    if (Number(sourceProject.remaining_budget) < value) {
      throw new CustomError({
        statusCode: 400,
        message: "Insufficient available budget",
      });
    }

    sourceProject.remaining_budget =
      Number(sourceProject.remaining_budget) - value;
    destinationProject.remaining_budget =
      Number(destinationProject.remaining_budget) + value;

    await sourceProject.save({ transaction: tx });
    await destinationProject.save({ transaction: tx });

    await budgetEventRepo.create(
      {
        project_id: sourceProject.id,
        value: -value,
        description: `${value} transferred to project ${destinationProject.name} (${destId})`,
        billing: false,
      },
      { transaction: tx },
    );
    await budgetEventRepo.create(
      {
        project_id: destinationProject.id,
        value: value,
        description: `${value} transferred from project ${sourceProject.name} (${sourceId})`,
        billing: false,
      },
      { transaction: tx },
    );

    logToDatabase({
      userId: user.id,
      action: "transaction",
      resource: "budgetEvents",
      description: `${value} transferred from project ${sourceProject.name} (${sourceId}) to project ${destinationProject.name} (${destId}) by ${user.email} (${user.sub})`,
    });

    return;
  });
};

export const getJobList = async (
  user: AuthUser,
  id: number,
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  const record = await organizationRepo.getOne(id);

  if (!record) {
    throw new CustomError({
      statusCode: 404,
      message: "Organization not found",
    });
  }

  // TODO: should not call getBudgetEvents directly but query repo?
  const records = await record.getJobs({
    where: filter,
    limit,
    offset,
    order,
    //attributes: ["id", "date", "value", "description"],
    joinTableAttributes: [], // join table fields
  });

  const count = await record.countJobs();

  return { rows: records, count };
};
