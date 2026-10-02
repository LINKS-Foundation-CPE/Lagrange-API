import { Request, Response, NextFunction } from "express";

export const restrictOrganization = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user;

  if (user.roles.includes("admin") || user.roles.includes("readOnlyAdmin"))
    return next();

  // Users without an organization (regular users, PIs) are not scoped here:
  // the org list is used read-only for name resolution (react-admin getMany),
  // so we let the request through without adding a filter. Any `id` filter the
  // request already carries still applies.
  if (!user.organization?.id) {
    return next();
  }

  // Org-managers are scoped to their own organization.
  req.filters = { ...req.filters, id: user.organization.id };

  next();
};
