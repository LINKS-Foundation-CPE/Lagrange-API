import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Models } from "./index.ts";

export class BudgetEvent extends Model<
  InferAttributes<BudgetEvent>,
  InferCreationAttributes<BudgetEvent>
> {
  declare id: CreationOptional<number>;
  declare project_id: number;
  declare value: number;
  declare date: CreationOptional<Date>;
  declare description: string;
  declare billing: CreationOptional<boolean>;
  /**
   * Who the transaction is attributable to: the job's submitter for a job
   * charge, the acting user for a reservation. Null where no user caused it —
   * a vault being funded, a project created with a budget — and null for job
   * charges older than the column that the backfill could not resolve.
   */
  declare user_id: CreationOptional<number | null>;
}

export function initBudgetEventModel(sequelize: Sequelize) {
  BudgetEvent.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: { type: DataTypes.INTEGER, allowNull: false },
      value: { type: DataTypes.BIGINT },
      date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      description: { type: DataTypes.STRING },
      billing: { type: DataTypes.BOOLEAN, defaultValue: true },
      user_id: { type: DataTypes.INTEGER, allowNull: true },
    },
    { sequelize, modelName: "budget_event" },
  );
  return BudgetEvent;
}

export function associateBudgetEventModel(models: Models) {
  BudgetEvent.belongsTo(models.Project, {
    foreignKey: "project_id",
    as: "project",
  });
  BudgetEvent.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
}
