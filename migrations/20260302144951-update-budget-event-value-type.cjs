"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("budget_events", "value", {
      type: Sequelize.BIGINT,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("budget_events", "value", {
      type: Sequelize.INTEGER,
    });
  },
};
