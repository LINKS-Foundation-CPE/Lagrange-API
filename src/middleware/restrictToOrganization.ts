import CustomError from "config/CustomError.ts";
import { Request, Response, NextFunction } from "express";

export const restrictToOrganization = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user;

  if (user.roles.includes("admin") || user.roles.includes("readOnlyAdmin"))
    return next();

  if (!user.organization?.id) {
    throw new CustomError({
      statusCode: 400,
      message: "User has no organization assigned",
    });
  }

  // Attach orgId to request for services to use
  req.filters = { ...req.filters, organization_id: user.organization.id };

  next();
};
