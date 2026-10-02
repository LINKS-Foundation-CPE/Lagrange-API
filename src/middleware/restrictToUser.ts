import CustomError from "config/CustomError.ts";
import { Request, Response, NextFunction } from "express";

export const restrictToUser = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user;

  // Platform admins and read-only admins are not scoped to their own rows —
  // this is what lets the admin "All Jobs" view list every user's jobs.
  // Without this bypass, /api/jobs is force-filtered to the caller's user_id
  // for everyone, so even an admin only ever sees their own jobs.
  if (user.roles.includes("admin") || user.roles.includes("readOnlyAdmin"))
    return next();

  if (!user.id) {
    throw new CustomError({
      statusCode: 400,
      message: "User has no id",
    });
  }

  // Attach orgId to request for services to use
  req.filters = { ...req.filters, user_id: user.id };

  next();
};
