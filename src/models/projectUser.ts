import { DataTypes, Model, Sequelize } from "sequelize";
import { Models } from "./index.ts";

export class ProjectUser extends Model {
  declare id: number;
  declare user_id: number;
  declare project_id: number;
  declare admin: boolean;
}

export const initProjectUserModel = (sequelize: Sequelize) => {
  ProjectUser.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: DataTypes.INTEGER,
        //primaryKey: true,
      },
      project_id: {
        type: DataTypes.INTEGER,
        //primaryKey: true,
      },
      admin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: "ProjectUser",
      tableName: "projects_users",
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ["user_id", "project_id"],
        },
      ],
    },
  );
  return ProjectUser;
};

export function associateProjectUserModel(models: Models) {
  //ProjectUser.belongsTo(User, { foreignKey: "user_id" });
  ProjectUser.belongsTo(models.Project, { foreignKey: "project_id" });
  ProjectUser.belongsTo(models.User, { foreignKey: "user_id" });
}
