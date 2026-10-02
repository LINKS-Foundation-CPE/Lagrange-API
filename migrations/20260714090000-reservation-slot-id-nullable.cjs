"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Reservations may be placed outside pre-allocated slots when
    // SLOT_CONSTRAINED_RESERVATIONS=false; slot_id becomes optional.
    await queryInterface.changeColumn("reservations", "slot_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("reservations", "slot_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
