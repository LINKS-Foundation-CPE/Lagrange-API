import { Request, Response } from "express";
import { parseQuery } from "utils/query.ts";
import { setGetListHeaders } from "utils/headers.ts";
import * as service from "services/job.service.ts";

export const getList = async (req: Request, res: Response) => {
  const { limit, offset, filters, order } = req; //await parseQuery(req.query, {});

  const { rows, count } = await service.getList(
    req.user,
    filters,
    limit,
    offset,
    order,
  );

  setGetListHeaders(res, offset, count, rows.length);

  res.json(rows);
};

export const getOne = async (req: Request, res: Response) => {
  const record = await service.getOne(Number(req.params.id));
  res.json(record);
};
