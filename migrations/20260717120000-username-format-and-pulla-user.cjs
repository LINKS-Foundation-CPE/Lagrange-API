"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Guarded like the other migrations in this repo, because a database that
    // was ever brought up with `sequelize.sync()` already has these objects
    // without the matching SequelizeMeta rows — and an unguarded addColumn then
    // fails and blocks every later migration.
    const tables = await queryInterface.showAllTables();
    const hasSystemConfigs = tables
      .map((t) => (typeof t === "string" ? t : t.tableName))
      .includes("system_configs");

    // Deployment-frozen configuration (e.g. username_format): written once at
    // first boot, later boots refuse to start on a conflicting env value.
    if (!hasSystemConfigs)
      await queryInterface.createTable("system_configs", {
        key: { type: Sequelize.STRING, primaryKey: true },
        value: { type: Sequelize.STRING, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });

    // Per-user grant of the pulla_user role (sweep submission) for HPC/Sqed
    // principals; read by the QC Gateway auth plugin via the roles lookup.
    const users = await queryInterface.describeTable("users");
    if (!users.pulla_user)
      await queryInterface.addColumn("users", "pulla_user", {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "pulla_user");
    await queryInterface.dropTable("system_configs");
  },
};
