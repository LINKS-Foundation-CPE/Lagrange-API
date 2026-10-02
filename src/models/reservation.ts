import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Models } from "./index.ts";

export class Reservation extends Model<
  InferAttributes<Reservation>,
  InferCreationAttributes<Reservation>
> {
  declare id: CreationOptional<number>;
  declare project_id: number;
  declare made_by: number;
  declare slot_id: number | null;
  declare day: Date;
  declare start: Date;
  declare end: Date;
  declare description: string | null;
  /** Shared by every reservation created as one recurring series; null otherwise. */
  declare series_id?: string | null;
}

export const initReservationModel = (sequelize: Sequelize) => {
  Reservation.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: { type: DataTypes.INTEGER, allowNull: false },
      made_by: { type: DataTypes.INTEGER, allowNull: false },
      slot_id: { type: DataTypes.INTEGER, allowNull: true },
      day: { type: DataTypes.DATEONLY, allowNull: false },
      start: { type: DataTypes.DATE, allowNull: false },
      end: { type: DataTypes.DATE, allowNull: false },
      description: { type: DataTypes.STRING },
      series_id: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: "reservation" },
  );
  return Reservation;
};

export function associateReservationModel(models: Models) {
  Reservation.belongsTo(models.Project, { foreignKey: "project_id" });
  Reservation.belongsTo(models.User, { foreignKey: "made_by" });
  Reservation.belongsTo(models.Slot, { foreignKey: "slot_id" });
}
