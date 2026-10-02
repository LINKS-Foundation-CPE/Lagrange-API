// import dotenv from "dotenv";

// // use .env by dwfault and ovveride with .test.env file
// dotenv.config({ path: ".env", quiet: true });
// //dotenv.config({ path: ".test.env", quiet: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports -- this is a CommonJS (.cjs) config consumed by sequelize-cli, which requires require()
require("dotenv").config();

module.exports = {
  development: {
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    host: process.env.DB_HOST,
    dialect: "postgres",
  },
  test: {
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    host: process.env.DB_HOST,
    dialect: "postgres",
  },
  production: {
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    host: process.env.DB_HOST,
    dialect: "postgres",
  },
};
