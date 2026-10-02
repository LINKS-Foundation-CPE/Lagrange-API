import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
  HasManyCountAssociationsMixin,
  FindOptions,
} from "sequelize";
import { Models, Job } from "./index.ts";

export class Organization extends Model<
  InferAttributes<Organization>,
  InferCreationAttributes<Organization>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare reference_organization_id: number | null;
  declare vault_project_id: CreationOptional<number>;
  // Invoked with an extra (ignored) join-table option, hence the widened type.
  declare getJobs: (
    options?: FindOptions & { joinTableAttributes?: string[] },
  ) => Promise<Job[]>;
  declare countJobs: HasManyCountAssociationsMixin;
}

export function initOrganizationModel(sequelize: Sequelize) {
  Organization.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false },
      reference_organization_id: { type: DataTypes.INTEGER, allowNull: true },
      vault_project_id: { type: DataTypes.INTEGER, allowNull: true },
    },
    { sequelize, modelName: "organization" },
  );
  return Organization;
}

export function associateOrganizationModel(models: Models) {
  Organization.hasMany(models.User, { foreignKey: "organization_id" });
  Organization.hasOne(models.Project, {
    as: "VaultProject",
    foreignKey: "vault_project_id",
  });
  Organization.hasMany(models.Slot, { foreignKey: "organization_id" });
  Organization.hasMany(models.Project, { foreignKey: "organization_id" });
  Organization.hasMany(models.OrganizationRole, {
    foreignKey: "organization_id",
  });
  Organization.hasMany(models.Job, {
    foreignKey: "organization_id",
    as: "jobs",
  });
}
