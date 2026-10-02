import { Sequelize } from "sequelize";
import logger from "./logger.ts";

// const sequelize = new Sequelize({
//   dialect: "sqlite",
//   storage: `${process.env.DATA_PREFIX || ""}db.sqlite`,
//   logging: (msg) => logger.debug(msg),
// });

let host = process.env.DB_HOST;
let port = process.env.DB_PORT;
const db = process.env.POSTGRES_DB;
const user = process.env.POSTGRES_USER;
const password = process.env.POSTGRES_PASSWORD;

if (!host) {
  logger.warn(
    "No host defined for database: using localhost - configure with env var  DB_HOST",
  );
  host = "localhost";
}

if (!port) {
  logger.warn(
    "No port defined for database: using 5432 - configure with env var  DB_PORT",
  );
  port = "5432";
}

if (!user) {
  throw new Error("DB user undefined: please define env var POSTGRES_USER");
}

if (!db) {
  throw new Error("DB undefined: please define env var POSTGRES_DB");
}

if (!user) {
  throw new Error("DB user undefined: please define env var POSTGRES_USER");
}

if (!password) {
  throw new Error(
    "DB password undefined: please define env var POSTGRES_PASSWORD",
  );
}

const sequelize = new Sequelize(db, user, password, {
  dialect: "postgres",
  host: host,
  port: parseInt(port),
  dialectOptions: {
    // Your pg options here
  },
  logging: (msg) => logger.debug(msg),
});
export default sequelize;
