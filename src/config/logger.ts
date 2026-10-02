import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.cli(),
  transports: [new winston.transports.Console()],
  silent: process.env.NO_LOG === "true",
});

export default logger;
