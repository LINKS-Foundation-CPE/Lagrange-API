import { DataTypes, Model, Sequelize } from "sequelize";
import { Models } from "./index.ts";

export class ActionLog extends Model {
  declare id: number;
  declare timestamp: Date;
  declare user_id: number | null;
  declare action: string;
  declare resource: string;
  declare resource_id: number;
  declare description: string;
}

export function initActionLogModel(sequelize: Sequelize) {
  ActionLog.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      timestamp: { type: DataTypes.DATE },
      user_id: { type: DataTypes.INTEGER, allowNull: true },
      action: { type: DataTypes.STRING },
      resource: { type: DataTypes.STRING },
      resource_id: { type: DataTypes.INTEGER },
      description: { type: DataTypes.TEXT },
    },
    { sequelize, modelName: "actionlog" },
  );
  return ActionLog;
}

export function associateActionLogModel(models: Models) {
  ActionLog.belongsTo(models.User, { foreignKey: "user_id" });
}
