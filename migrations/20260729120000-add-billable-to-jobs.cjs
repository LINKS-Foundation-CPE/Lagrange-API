"use strict";

/**
 * `jobs.billable` — the amount charged for a job when the deployment reports
 * it explicitly (ACCEPT_REPORTED_BILLING) instead of being billed the
 * execution window. BIGINT to match projects.remaining_budget, which it is
 * subtracted from; nullable, and null for every job billed the old way, so
 * existing deployments are unaffected by this column existing.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("jobs");
    if (!table.billable) {
      await queryInterface.addColumn("jobs", "billable", {
        type: Sequelize.BIGINT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("jobs");
    if (table.billable) {
      await queryInterface.removeColumn("jobs", "billable");
    }
  },
};
