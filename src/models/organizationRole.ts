import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Models } from "./index.ts";

export class OrganizationRole extends Model<
  InferAttributes<OrganizationRole>,
  InferCreationAttributes<OrganizationRole>
> {
  declare id: CreationOptional<number>;
  declare organization_id: number;
  declare user_id: number;
  declare admin: CreationOptional<boolean>;
  declare auditor: CreationOptional<boolean>;
}

export const initOrganizationRoleModel = (sequelize: Sequelize) => {
  OrganizationRole.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      organization_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "organizations", key: "id" },
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      admin: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      auditor: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
    },
    {
      sequelize,
      tableName: "organization_roles",
      timestamps: false,
    },
  );
  return OrganizationRole;
};

export function associateOrganizationRoleModel(models: Models) {
  OrganizationRole.belongsTo(models.User, { foreignKey: "user_id" });
  OrganizationRole.belongsTo(models.Organization, {
    foreignKey: "organization_id",
  });
}
