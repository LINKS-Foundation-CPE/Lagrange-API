import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Models } from "./index.ts";

export class Job extends Model<
  InferAttributes<Job>,
  InferCreationAttributes<Job>
> {
  declare id: CreationOptional<number>;
  declare organization_id: number;
  declare project_id: number;
  declare user_id: number;
  declare jobid: string;
  declare status: CreationOptional<string | null>;
  declare execution_start: CreationOptional<Date | null>;
  declare execution_end: CreationOptional<Date | null>;
  declare submitted_datetime: CreationOptional<Date | null>;
  declare submitted_circuit: CreationOptional<string | null>;
  declare results: CreationOptional<string | null>;
  declare usedReservation: CreationOptional<boolean | null>;
  declare job_type: CreationOptional<string | null>;
  /**
   * Amount charged for this job when the deployment reports it explicitly
   * (`ACCEPT_REPORTED_BILLING`), in that deployment's billing unit. Null when
   * the job was billed the execution window instead, which is the default and
   * the only Lagrange behaviour. Doubles as the "already billed" marker for
   * reports that carry no execution timestamps.
   */
  declare billable: CreationOptional<number | null>;
}

export function initJobModel(sequelize: Sequelize) {
  Job.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      project_id: { type: DataTypes.INTEGER, allowNull: false },
      user_id: { type: DataTypes.INTEGER },
      jobid: { type: DataTypes.STRING, allowNull: false },
      status: { type: DataTypes.STRING },
      execution_start: { type: DataTypes.DATE },
      execution_end: { type: DataTypes.DATE },
      submitted_datetime: { type: DataTypes.DATE },
      submitted_circuit: { type: DataTypes.STRING },
      results: { type: DataTypes.STRING },
      usedReservation: { type: DataTypes.BOOLEAN, defaultValue: false },
      job_type: { type: DataTypes.STRING, defaultValue: "circuit" },
      billable: { type: DataTypes.BIGINT },
    },
    { sequelize, modelName: "job" },
  );
  return Job;
}

export function associateJobModel(models: Models) {
  Job.belongsTo(models.User, { foreignKey: "user_id" });
  Job.belongsTo(models.Project, { foreignKey: "project_id" });
  Job.belongsTo(models.Organization, { foreignKey: "organization_id" });
}
