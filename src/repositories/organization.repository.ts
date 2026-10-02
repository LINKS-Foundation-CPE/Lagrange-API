import {
  InferAttributes,
  InferCreationAttributes,
  Optional,
  Order,
} from "sequelize";
import { Organization, Project, User, Transaction } from "../models/index.ts";

export const getList = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) =>
  Organization.findAndCountAll({
    limit,
    offset,
    order,
    where: filter,
  });

export const getOne = (id: number) => Organization.findByPk(id);

export const create = (
  data: Optional<
    InferCreationAttributes<Organization>,
    "id" | "reference_organization_id" | "vault_project_id"
  >,
  options?: { transaction?: Transaction },
) => {
  return Organization.create(data, options);
};

export const update = async (
  id: number,
  data: Optional<
    InferAttributes<Organization>,
    "id" | "reference_organization_id" | "vault_project_id"
  >,
) => {
  const organization = await Organization.findByPk(id);

  if (!organization) return null;

  return organization.update(data);
};

// export const findByName = (name: string) => {
//   return Organization.findOne({
//     where: {
//       name: name,
//     },
//   });
// };
