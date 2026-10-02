"use strict";

/**
 * `budget_events.user_id` — who a transaction is attributable to.
 *
 * The table records what moved and why, in prose, but never who: a job charge
 * says which job it was and a reservation charge says which reservation, and
 * finding the person meant following that string somewhere else. Nullable,
 * because plenty of transactions have no user behind them at all — an
 * organization's vault being funded, a project being created with a budget.
 *
 * `ON DELETE SET NULL`: a ledger entry outlives the account that caused it.
 * Deleting a user must not delete the record of what they spent, and must not
 * be blocked by it either.
 *
 * The `up` also backfills the job charges already on record. Both descriptions
 * the biller writes start `Job <jobid> (<row id>)`, so the row id can be lifted
 * out and joined to `jobs`. A row that does not match is left null rather than
 * guessed at.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("budget_events");
    if (!table.user_id) {
      await queryInterface.addColumn("budget_events", "user_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    await queryInterface.sequelize.query(String.raw`
      UPDATE budget_events be
         SET user_id = j.user_id
        FROM jobs j
       WHERE be.user_id IS NULL
         AND j.user_id IS NOT NULL
         AND j.id = NULLIF(
               substring(be.description from 'Job [^ ]+ \((\d+)\)'), ''
             )::integer
    `);
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("budget_events");
    if (table.user_id) {
      await queryInterface.removeColumn("budget_events", "user_id");
    }
  },
};
