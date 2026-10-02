import { Response, NextFunction } from "express";
import { User } from "../models/index.js";
import { AuthenticatedRequest } from "./authenticateJWT.js";

async function loadFullUser(
  req: AuthenticatedRequest,
  res: Response,
  resource: string,
): Promise<User | null> {
  if (!req.user?.email) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  try {
    const user = await User.findOne({
      where: {
        email: req.user?.email,
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return null;
    }

    switch (resource) {
      case "project":
        // find project roles for current user
        break;
      case "organization":
        // find organization roles for current user
        break;
      case "reservation":
        // find reservation roles for current user
        break;
    }

    return user;
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
    return null;
  }
}

export const authorizeProjectRequest = (permission: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const user = await loadFullUser(req, res, "project");
    if (!user) return;

    //   const userPermissions = user.ro.flatMap(role => role.Permissions.map(p => p.name));
    //   if (!userPermissions.includes(permission)) {
    //     return res.status(403).json({ error: 'Forbidden: Missing permission' });
    //   }

    next();
  };
};
