"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("jobs");
    if (!table.job_type) {
      await queryInterface.addColumn("jobs", "job_type", {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "circuit",
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("jobs", "job_type");
  },
};
