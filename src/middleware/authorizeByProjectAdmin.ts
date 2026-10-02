import CustomError from "config/CustomError.ts";
import { Request, Response, NextFunction } from "express";

export const authorizeByProjectAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user;
  const administeredProjects = user.administeredProjects;
  const id = req.params.id;

  if (
    !user.roles.includes("admin") &&
    !user.roles.includes("organization-manager") &&
    !administeredProjects.includes(Number(id))
  ) {
    throw new CustomError({ statusCode: 403, message: "Unauthorized" });
  }

  // if (!user) {
  //   throw new CustomError({ statusCode: 401, message: "Unauthorized" });
  // }

  // if (!user.roles) {
  //   throw new CustomError({ statusCode: 403, message: "Forbidden" });
  // }

  // const hasRole = roles.some((role) => user.roles.includes(role));
  // if (!hasRole) {
  //   throw new CustomError({ statusCode: 403, message: "Forbidden" });
  // }

  next();
};
