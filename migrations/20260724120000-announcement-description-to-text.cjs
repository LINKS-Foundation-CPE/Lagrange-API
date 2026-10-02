"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Ensure the announcement body is unbounded TEXT. Deployments whose table was
  // created by an older schema (model used STRING) have a VARCHAR(255)
  // `description` that silently truncates long announcements — and sync() never
  // alters an existing column. The model is already DataTypes.TEXT; this brings
  // existing databases in line so long announcements are stored in full.
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("announcements", "description", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("announcements", "description", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};
