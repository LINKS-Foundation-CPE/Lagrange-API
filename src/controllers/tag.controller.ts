import { Request, Response } from "express";
import { parseQuery } from "utils/query.ts";
import { setGetListHeaders } from "utils/headers.ts";
import * as service from "services/tag.service.ts";

export const getList = async (req: Request, res: Response) => {
  const { limit, offset, filter, order } = await parseQuery(req.query, {});
  const { rows, count } = await service.getList(
    filter,
    Number(limit),
    Number(offset),
    order,
  );
  setGetListHeaders(res, offset, count, rows.length);
  res.json(rows);
};

export const getOne = async (req: Request, res: Response) => {
  res.json(await service.getOne(Number(req.params.id)));
};

export const create = async (req: Request, res: Response) => {
  res.json(await service.create(req.body.name));
};

export const update = async (req: Request, res: Response) => {
  res.json(await service.update(Number(req.params.id), req.body.name));
};

export const destroy = async (req: Request, res: Response) => {
  res.json(await service.destroy(Number(req.params.id)));
};

/** Project sub-resource: which of the vocabulary this project carries. */
export const getForProject = async (req: Request, res: Response) => {
  res.json(await service.getForProject(Number(req.params.id)));
};

export const setForProject = async (req: Request, res: Response) => {
  res.json(
    await service.setForProject(Number(req.params.id), req.body.tag_ids),
  );
};
