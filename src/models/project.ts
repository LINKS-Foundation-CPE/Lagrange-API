import {
  DataTypes,
  Model,
  BelongsToManyGetAssociationsMixin,
  Sequelize,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  BelongsToManyAddAssociationMixin,
  BelongsToManyCountAssociationsMixin,
  BelongsToManyHasAssociationMixin,
  BelongsToManySetAssociationsMixin,
  HasManyCountAssociationsMixin,
  FindOptions,
} from "sequelize";
import { Models, User, BudgetEvent, Job, Tag } from "./index.ts";

export class Project extends Model<
  InferAttributes<Project>,
  InferCreationAttributes<Project, { omit: "total_freequeue_time" }>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare remaining_budget: CreationOptional<number>;
  declare start_at: Date | null;
  declare end_at: Date | null;
  declare free_queue: boolean | null;
  declare organization_id: number;
  declare total_freequeue_time: number;
  declare getUsers: BelongsToManyGetAssociationsMixin<User>;
  declare addUser: BelongsToManyAddAssociationMixin<User, number>;
  declare hasUser: BelongsToManyHasAssociationMixin<User, number>;
  declare countUsers: BelongsToManyCountAssociationsMixin;
  // These hasMany getters are invoked with an extra (ignored) join-table
  // option, hence the widened signature.
  declare getBudgetEvents: (
    options?: FindOptions & { joinTableAttributes?: string[] },
  ) => Promise<BudgetEvent[]>;
  declare countBudgetEvents: HasManyCountAssociationsMixin;
  declare getJobs: (
    options?: FindOptions & { joinTableAttributes?: string[] },
  ) => Promise<Job[]>;
  declare countJobs: HasManyCountAssociationsMixin;
  // Tags are a controlled vocabulary held on the association only; setTags
  // replaces the whole set, which is how an assignment is expressed.
  declare getTags: (
    options?: FindOptions & { joinTableAttributes?: string[] },
  ) => Promise<Tag[]>;
  declare setTags: BelongsToManySetAssociationsMixin<Tag, number>;
}

export function initProjectModel(sequelize: Sequelize) {
  Project.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
      remaining_budget: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      start_at: { type: DataTypes.DATE, allowNull: true },
      end_at: { type: DataTypes.DATE, allowNull: true },
      free_queue: { type: DataTypes.BOOLEAN, defaultValue: false },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      total_freequeue_time: { type: DataTypes.VIRTUAL },
    },
    { sequelize, modelName: "project" },
  );
  return Project;
}

export function associateProjectModel(models: Models) {
  Project.belongsTo(models.Organization, { foreignKey: "organization_id" });
  Project.hasMany(models.User, {
    as: "DefaultUsers",
    foreignKey: "default_project_id",
  });
  Project.belongsToMany(models.User, {
    through: models.ProjectUser,
    foreignKey: "project_id",
  });
  Project.hasMany(models.ProjectUser, {
    foreignKey: "project_id",
  });
  Project.hasMany(models.BudgetEvent, {
    foreignKey: "project_id",
    as: "budgetEvents",
  });
  Project.belongsToMany(models.Tag, { through: "ProjectTags" });
  Project.hasMany(models.Job, {
    foreignKey: "project_id",
    as: "jobs",
  });
}
