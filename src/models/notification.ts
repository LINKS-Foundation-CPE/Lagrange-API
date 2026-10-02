import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Models } from "./index.ts";

export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  declare id: CreationOptional<number>;
  declare timestamp: Date | null;
  declare user_id: number;
  declare type: string | null;
  declare title: string;
  declare description: string;
  declare read: boolean | null;
}

export function initNotificationModel(sequelize: Sequelize) {
  Notification.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      type: { type: DataTypes.STRING },
      title: { type: DataTypes.STRING },
      description: { type: DataTypes.TEXT },
      read: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { sequelize, modelName: "notification" },
  );
  return Notification;
}

export function associateNotificationModel(models: Models) {
  Notification.belongsTo(models.User, { foreignKey: "user_id" });
}
