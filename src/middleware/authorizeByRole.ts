import CustomError from "config/CustomError.ts";
import { Request, Response, NextFunction } from "express";

export const requireRoles =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      throw new CustomError({ statusCode: 401, message: "Unauthorized" });
    }

    if (!user.roles) {
      throw new CustomError({ statusCode: 403, message: "Forbidden" });
    }

    const hasRole = roles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new CustomError({ statusCode: 403, message: "Forbidden" });
    }

    next();
  };
