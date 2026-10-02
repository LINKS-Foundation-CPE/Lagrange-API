import logger from "config/logger.ts";
import CustomError from "../config/CustomError.ts";
import { Request, Response, NextFunction } from "express";

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
