import {
  CreationOptional,
  DataTypes,
  HasManyAddAssociationMixin,
  HasManyGetAssociationsMixin,
  HasManyHasAssociationMixin,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Models, Reservation } from "./index.ts";

export class Slot extends Model<
  InferAttributes<Slot>,
  InferCreationAttributes<Slot>
> {
  declare id: CreationOptional<number>;
  declare organization_id: number;
  declare day: Date;
  declare start: Date;
  declare end: Date;
  /** Shared by every slot created as one recurring series; null for a single slot. */
  declare series_id?: string | null;
  declare getReservations: HasManyGetAssociationsMixin<Reservation>;
  declare addReservation: HasManyAddAssociationMixin<Reservation, number>;
  declare hasReservation: HasManyHasAssociationMixin<Reservation, number>;
}

export const initSlotModel = (sequelize: Sequelize) => {
  Slot.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      day: { type: DataTypes.DATEONLY, allowNull: false },
      start: { type: DataTypes.DATE, allowNull: false },
      end: { type: DataTypes.DATE, allowNull: false },
      series_id: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: "slot" },
  );
  return Slot;
};

export function associateSlotModel(models: Models) {
  Slot.belongsTo(models.Organization, { foreignKey: "organization_id" });
  Slot.hasMany(models.Reservation, { foreignKey: "slot_id" });
}
