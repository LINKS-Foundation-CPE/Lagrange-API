import { Request, Response, NextFunction } from "express";
import { parseQuery } from "utils/query.ts";
export const parseQueryIntoFilters = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { limit, offset, filter, order } = await parseQuery(req.query, {});
  req.limit = limit;
  req.offset = offset;
  req.filters = filter;
  req.order = order;
  next();
};
