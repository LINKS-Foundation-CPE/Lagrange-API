import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

/**
 * Key/value store for deployment-level configuration that is frozen at first
 * boot and must never drift afterwards (e.g. `username_format`). Not meant
 * for mutable runtime settings.
 */
export class SystemConfig extends Model<
  InferAttributes<SystemConfig>,
  InferCreationAttributes<SystemConfig>
> {
  declare key: string;
  declare value: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export const initSystemConfigModel = (sequelize: Sequelize) => {
  SystemConfig.init(
    {
      key: { type: DataTypes.STRING, primaryKey: true },
      value: { type: DataTypes.STRING, allowNull: false },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: "system_config" },
  );
  return SystemConfig;
};
