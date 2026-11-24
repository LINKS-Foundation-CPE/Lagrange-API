"use strict";

/**
 * QPU sessions (an exclusive hold on the machine; IQM calls them iterations).
 *
 * users.session_access / session_max_seconds — the per-user grant and cap, set
 * by an administrator. Default off: a deployment that never grants it behaves
 * exactly as before.
 *
 * jobs.is_session / session_id / session_kind — a session is a row of its own
 * (`is_session`, charged up front); a job run inside one carries the session's
 * vendor id and term and is not charged. All nullable or defaulted, so existing
 * rows are untouched.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const users = await queryInterface.describeTable("users");
    if (!users.session_access) {
      await queryInterface.addColumn("users", "session_access", {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      });
    }
    if (!users.session_max_seconds) {
      await queryInterface.addColumn("users", "session_max_seconds", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
    const jobs = await queryInterface.describeTable("jobs");
    if (!jobs.is_session) {
      await queryInterface.addColumn("jobs", "is_session", {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      });
    }
    if (!jobs.session_id) {
      await queryInterface.addColumn("jobs", "session_id", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!jobs.session_kind) {
      await queryInterface.addColumn("jobs", "session_kind", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    for (const [table, column] of [
      ["jobs", "session_kind"],
      ["jobs", "session_id"],
      ["jobs", "is_session"],
      ["users", "session_max_seconds"],
      ["users", "session_access"],
    ]) {
      const t = await queryInterface.describeTable(table);
      if (t[column]) await queryInterface.removeColumn(table, column);
    }
  },
};
