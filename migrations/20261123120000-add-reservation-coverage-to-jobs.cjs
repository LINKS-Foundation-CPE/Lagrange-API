"use strict";

/**
 * `jobs.reservation_ids` and `jobs.reservation_covered_ms` — which of its own
 * project's reservations a job's execution overlapped, and for how many
 * milliseconds. Billing already decides this from the execution window and
 * writes it into the ledger description; these keep it on the job, so the job
 * list can say "billed as part of reservation N".
 *
 * Backfilled for jobs flagged `usedReservation` that have an execution window,
 * by the same rule billing uses: half-open intervals, the job's own project
 * only. Unflagged jobs are left null even if they overlap a reservation: under
 * the rule before billing by execution window they were charged in full, and
 * the job list must not say otherwise (the overlap refund, which corrects such
 * charges, sets the columns itself). Reservations of one
 * project do not overlap, so the covered time is a plain sum of the clipped
 * overlaps. Nullable, and null where no reservation covered the job.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("jobs");
    if (!table.reservation_ids) {
      await queryInterface.addColumn("jobs", "reservation_ids", {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: true,
      });
    }
    if (!table.reservation_covered_ms) {
      await queryInterface.addColumn("jobs", "reservation_covered_ms", {
        type: Sequelize.BIGINT,
        allowNull: true,
      });
    }
    await queryInterface.sequelize.query(`
      UPDATE jobs j
         SET reservation_ids = c.ids,
             reservation_covered_ms = c.ms
        FROM (
          SELECT j2.id,
                 array_agg(r.id ORDER BY r.start) AS ids,
                 SUM(EXTRACT(EPOCH FROM (LEAST(j2.execution_end, r."end")
                                       - GREATEST(j2.execution_start, r.start))) * 1000)::bigint AS ms
            FROM jobs j2
            JOIN reservations r
              ON r.project_id = j2.project_id
             AND r.start < j2.execution_end
             AND r."end" > j2.execution_start
           WHERE j2."usedReservation" = true
             AND j2.execution_start IS NOT NULL
             AND j2.execution_end > j2.execution_start
           GROUP BY j2.id
        ) c
       WHERE j.id = c.id
    `);
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("jobs");
    if (table.reservation_covered_ms) {
      await queryInterface.removeColumn("jobs", "reservation_covered_ms");
    }
    if (table.reservation_ids) {
      await queryInterface.removeColumn("jobs", "reservation_ids");
    }
  },
};
