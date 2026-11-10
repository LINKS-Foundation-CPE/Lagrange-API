import logger from "config/logger.ts";
import CustomError from "../config/CustomError.ts";
import { Request, Response, NextFunction } from "express";

/** An `http-errors` error with a 4xx status, as body-parser raises. */
const isClientHttpError = (
  err: unknown,
): err is Error & { status: number; expose: true } => {
  const e = err as { status?: unknown; expose?: unknown };
  return (
    typeof e.status === "number" &&
    e.status >= 400 &&
    e.status < 500 &&
    e.expose === true
  );
};

const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  //const errStatus = err.statusCode || 500;
  const errMsg = err.message || "Something went wrong";
  if (err instanceof CustomError) {
    // Handle your custom errors
    res
      .status(err.statusCode)
      .json({ message: err.message, errors: err.errors });
  } else if (isClientHttpError(err)) {
    // Errors raised by Express middleware for a bad request (body-parser: a
    // compressed body, malformed JSON, an oversized payload) carry their own
    // 4xx status and a message meant for the client. They are not server
    // faults: answer with that status rather than a 500.
    res.status(err.status).json({ message: err.message });
  } else {
    logger.error(err);
    res.status(500).json({
      //success: false,
      //status: errStatus,
      message: errMsg,
      //stack: process.env.NODE_ENV === "development" ? err.stack : {},
    });
  }
};

export default errorHandler;

/*
app.use((err, req, res, next) => {
    if (err instanceof CustomError) {
      // Handle your custom errors
      res.status(err.statusCode).json({ error: err.message });
    } else if (err instanceof Sequelize.ValidationError) {
      // Handle Sequelize validation errors
      res.status(400).json({ error: 'Validation failed', details: err.errors });
    } else {
      // Handle other internal errors
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
});
*/
