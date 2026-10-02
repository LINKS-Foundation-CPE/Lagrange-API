import {
  DataTypes,
  Model,
  BelongsToManyGetAssociationsMixin,
  Sequelize,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { Models, Project } from "./index.ts";

export class Tag extends Model<
  InferAttributes<Tag>,
  InferCreationAttributes<Tag>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare getProjects: BelongsToManyGetAssociationsMixin<Project>;
}

export function initTagModel(sequelize: Sequelize) {
  Tag.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
    },
    { sequelize, modelName: "tag" },
  );
  return Tag;
}

export function associateTagModel(models: Models) {
  Tag.belongsToMany(models.Project, {
    through: "ProjectTags",
  });
}
