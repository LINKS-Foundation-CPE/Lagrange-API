import {
  Optional,
  InferCreationAttributes,
  InferAttributes,
  Order,
} from "sequelize";
import { Transaction, User } from "../models/index.ts";

export const getList = (
  filter: Record<string, unknown>,
  limit?: number,
  offset?: number,
  order?: Order,
) => {
  return User.findAndCountAll({ where: filter, limit, offset, order });
};

export const getOne = (id: number) => User.findByPk(id);

export const create = (
  data: Optional<
    InferCreationAttributes<User>,
    | "id"
    | "sub"
    | "organization_id"
    | "default_project_id"
    | "organization_manager"
    | "organization_auditor"
    | "pulla_user"
  >,
  options?: { transaction?: Transaction },
) => User.create(data, options);

export const update = async (
  id: number,
  data: Partial<InferAttributes<User>>,
) => {
  const record = await User.findByPk(id);

  if (!record) return null;

  return record.update(data);
};

export const getBySub = (sub: string) => User.findOne({ where: { sub: sub } });

export const getByEmail = (email: string) =>
  User.findOne({ where: { email: email } });

export async function updateSub(id: number, sub: string) {
  const user = await User.findByPk(id);

  if (!user) return null;

  user.sub = sub;
  return user.save();
}

export const getUserDefaultProject = async (id: number) => {
  const user = await getOne(id);
  return user?.default_project_id;
};

export const setUserDefaultProject = async (
  userId: number,
  projectId: number,
) => {
  const user = await getOne(userId);
  return user?.setDefaultProject(projectId);
};
