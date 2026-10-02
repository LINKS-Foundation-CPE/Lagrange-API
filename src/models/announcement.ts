import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Models } from "./index.ts";
// import sequelize from '../config/database';

export class Announcement extends Model<
  InferAttributes<Announcement>,
  InferCreationAttributes<Announcement>
> {
  declare id: CreationOptional<number>;
  declare made_by: number;
  // show the announcement from this date
  declare start: Date | null;
  // show the announcement until this date
  declare end: Date | null;
  declare title: string;
  declare description: string;
}

export function initAnnouncementModel(sequelize: Sequelize) {
  Announcement.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      made_by: { type: DataTypes.INTEGER },
      start: { type: DataTypes.DATE, allowNull: true },
      end: { type: DataTypes.DATE, allowNull: true },
      title: { type: DataTypes.STRING },
      description: { type: DataTypes.TEXT },
    },
    {
      sequelize,
      modelName: "announcement",
      tableName: "announcements",
    },
  );

  return Announcement;
}

export function associateAnnouncementModel(models: Models) {
  Announcement.belongsTo(models.User, { foreignKey: "made_by" });
}
