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
  /**
   * The reservations of the job's own project its execution overlapped, by id,
   * and how many milliseconds of it they covered. Set when the job is billed
   * from its execution window; null until then, and for a job no reservation
   * covered. Covered time is not charged (see `reservationCoverage`), so
   * `reservation_covered_ms` equal to the execution time means the job was
   * billed entirely as part of the reservation.
   */
  declare reservation_ids: CreationOptional<number[] | null>;
  /**
   * QPU sessions (an exclusive hold on the machine; IQM calls them iterations).
   * A session is itself a row, `is_session`, with its vendor id as `jobid` and
   * the vendor's term as `job_type`; it is charged up front when opened, like a
   * reservation. A job run inside one carries its id and term in `session_id`
   * and `session_kind` and is not charged.
   */
  declare is_session: CreationOptional<boolean | null>;
  declare session_id: CreationOptional<string | null>;
  declare session_kind: CreationOptional<string | null>;
  declare reservation_covered_ms: CreationOptional<number | null>;
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
      reservation_ids: { type: DataTypes.ARRAY(DataTypes.INTEGER) },
      is_session: { type: DataTypes.BOOLEAN, defaultValue: false },
      session_id: { type: DataTypes.STRING },
      session_kind: { type: DataTypes.STRING },
      reservation_covered_ms: {
        type: DataTypes.BIGINT,
        // BIGINT comes back from pg as a string; the ms fit a JS number.
        get() {
          const v = this.getDataValue("reservation_covered_ms");
          return v === null || v === undefined ? null : Number(v);
        },
      },
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
