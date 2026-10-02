import {
  BelongsToGetAssociationMixin,
  BelongsToManyAddAssociationMixin,
  BelongsToManyGetAssociationsMixin,
  BelongsToManyHasAssociationMixin,
  BelongsToSetAssociationMixin,
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Models, Organization, Project } from "./index.ts";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare sub: string | null;
  declare organization_id: CreationOptional<number | null>;
  declare organization_manager: boolean | null;
  declare organization_auditor: boolean | null;
  declare pulla_user: boolean | null;
  declare default_project_id?: number | null; // default project
  // Populated when the Organization association is eager-loaded.
  declare organization?: Organization | null;
  declare getOrganization: BelongsToGetAssociationMixin<Organization>;
  declare getProjects: BelongsToManyGetAssociationsMixin<Project>;
  declare getDefaultProject: BelongsToGetAssociationMixin<Project>;
  declare addProject: BelongsToManyAddAssociationMixin<Project, number>;
  declare hasProject: BelongsToManyHasAssociationMixin<Project, number>;
  declare setDefaultProject: BelongsToSetAssociationMixin<Project, number>;
}

export const initUserModel = (sequelize: Sequelize) => {
  User.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      email: { type: DataTypes.STRING, unique: true, allowNull: false },
      sub: { type: DataTypes.STRING, unique: true, allowNull: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true },
      default_project_id: { type: DataTypes.INTEGER, allowNull: true },
      organization_manager: { type: DataTypes.BOOLEAN, defaultValue: false },
      organization_auditor: { type: DataTypes.BOOLEAN, defaultValue: false },
      // grants the pulla_user role (sweep submission) to HPC/Sqed principals;
      // looked up by the QC Gateway's auth plugin
      pulla_user: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { sequelize, modelName: "user" },
  );
  return User;
};

export function associateUserModel(models: Models) {
  User.belongsTo(models.Organization, { foreignKey: "organization_id" });
  User.belongsTo(models.Project, {
    foreignKey: "default_project_id",
    as: "defaultProject",
  });
  User.belongsToMany(models.Project, {
    through: models.ProjectUser,
    foreignKey: "user_id",
  });
  //User.hasMany(models.ProjectUser, { foreignKey: "user_id" });
  User.hasMany(models.Notification, { foreignKey: "user_id" });
  User.hasMany(models.Announcement, { foreignKey: "made_by" });
  User.hasMany(models.OrganizationRole, { foreignKey: "user_id" });
  User.hasMany(models.Job, {
    foreignKey: "user_id",
    as: "jobs",
  });
}
