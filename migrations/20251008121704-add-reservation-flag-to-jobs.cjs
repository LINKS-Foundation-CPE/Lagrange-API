"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("jobs");
    if (!table.usedReservation) {
      await queryInterface.addColumn("jobs", "usedReservation", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("jobs", "usedReservation");
  },
};
