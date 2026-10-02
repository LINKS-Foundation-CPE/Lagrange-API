//import express from "express";
import "dotenv/config";
import logger from "./config/logger.ts";
import sequelize from "./config/database.ts";
//import { initModels } from "./models/index.ts";
import https from "https";
import fs from "fs";

import { createApp } from "./app.ts";
import { freezeUsernameFormat } from "./config/usernamePolicy.ts";

if (!process.env.KEYCLOAK_BASE_URL || !process.env.KEYCLOAK_REALM) {
  throw new Error("Please configure keycloak environment");
}

let options = {};

if (process.env.SSL_CERT && process.env.SSL_KEY) {
  options = {
    key: fs.readFileSync(process.env.SSL_KEY), //'../api.key'),
    cert: fs.readFileSync(process.env.SSL_CERT), //'../api.crt')
  };
}

// Sync database and start server
const PORT = process.env.API_PORT || 8500;

const app = createApp(sequelize);

// reset DB
sequelize
  .sync(/* {
    force: true,
    alter: true,
  } */)
  .then(async () => {
    // deployment-frozen settings: refuses to start on a conflicting change
    await freezeUsernameFormat();

    logger.info("Database connected & synchronized");
    if (process.env.SSL_CERT && process.env.SSL_KEY) {
      logger.info("Using HTTPS");
      https.createServer(options, app).listen(PORT, () => {
        logger.info("HTTPS Server running on port ${PORT}");
      });
    } else {
      logger.info("HTTPS not configured - using http");
      app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
    }
  })
  .catch((err) => {
    logger.error("Fatal startup error: ");
    logger.error(err);
    process.exit(1);
  });
