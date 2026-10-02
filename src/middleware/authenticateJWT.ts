import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import logger from "../config/logger.ts";
import CustomError from "config/CustomError.ts";
import { AuthUser } from "../types/auth.ts";

export const authorizeRoles = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userRoles = req.user?.roles || [];
    if (!roles.some((role) => userRoles.includes(role))) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    throw new CustomError({
      statusCode: 401,
      message: "Missing Authorization header",
    });

  const token = authHeader.split(" ")[1];
  if (!token)
    throw new CustomError({
      statusCode: 401,
      message: "Missing token",
    });

  try {
    const decoded = jwt.verify(token, process.env.BACKEND_SECRET!) as AuthUser;
    req.user = {
      id: decoded.id,
      sub: decoded.sub,
      email: decoded.email,
      roles: decoded.roles,
      organization: decoded.organization,
      administeredProjects: decoded.administeredProjects,
    };
    next();
  } catch (err) {
    logger.debug("JWT verification failed:", err);
    throw new CustomError({
      statusCode: 401,
      message: "Invalid or expired token",
    });
  }
};
