"use strict";

/**
 * `series_id` on `slots` and `reservations` — which recurring series a row was
 * created in.
 *
 * Every occurrence of a series is an ordinary row, indistinguishable from one
 * made by hand, so that nothing else — the calendar, the reports, the billing —
 * needs to know recurrence exists. The id is only the handle for acting on the
 * series as a whole afterwards: deleting it and all future occurrences in one
 * go instead of one at a time.
 *
 * Nullable, and null for every existing row: nothing made before this was
 * created as a series, and inventing groupings for them after the fact would be
 * a guess. Indexed, because deleting a series looks its rows up by it.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of ["slots", "reservations"]) {
      const columns = await queryInterface.describeTable(table);
      if (!columns.series_id) {
        await queryInterface.addColumn(table, "series_id", {
          type: Sequelize.UUID,
          allowNull: true,
        });
      }
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "${table}_series_id" ON "${table}" ("series_id")`,
      );
    }
  },

  async down(queryInterface) {
    for (const table of ["slots", "reservations"]) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${table}_series_id"`);
      const columns = await queryInterface.describeTable(table);
      if (columns.series_id) {
        await queryInterface.removeColumn(table, "series_id");
      }
    }
  },
};
