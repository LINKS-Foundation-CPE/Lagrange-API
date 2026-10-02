import { Request, Response } from "express";
import * as service from "services/user.service.ts";
import { parseQuery } from "utils/query.ts";
import { setGetListHeaders } from "utils/headers.ts";

export const getList = async (req: Request, res: Response) => {
  const { limit, offset, filters: filter, order } = req; //await parseQuery(req.query, {});
  const { rows, count } = await service.getList(
    req.user,
    filter,
    Number(limit),
    Number(offset),
    order,
  );

  setGetListHeaders(res, offset, count, rows.length);

  res.json(rows);
};

export const getOne = async (req: Request, res: Response) => {
  const record = await service.getOne(Number(req.params.id));
  res.json(record);
};

export const create = async (req: Request, res: Response) => {
  const record = await service.create(req.body, req.user);
  res.status(201).json(record);
};

export const update = async (req: Request, res: Response) => {
  const record = await service.update(
    Number(req.params.id),
    req.body,
    req.user,
  );
  res.json(record);
};

export const getUserProjects = async (req: Request, res: Response) => {
  const { limit, offset, filters: filter, order } = req; //await parseQuery(req.query, {});
  let id = 0;

  if (req.params.id) {
    id = Number(req.params.id);
  } else {
    id = req.user.id;
  }

  const { rows, count } = await service.getUserProjects(
    id,
    filter,
    Number(limit),
    Number(offset),
    order,
  );

  setGetListHeaders(res, offset, count, rows.length);

  res.json(rows);
};

export const getUserJobs = async (req: Request, res: Response) => {
  const { limit, offset, filters: filter, order } = req; //await parseQuery(req.query, {});
  let id = 0;

  if (req.params.id) {
    id = Number(req.params.id);
  } else {
    id = req.user.id;
  }

  const { rows, count } = await service.getUserJobs(
    id,
    filter,
    Number(limit),
    Number(offset),
    order,
  );

  setGetListHeaders(res, offset, count, rows.length);

  res.json(rows);
};

export const getUserDefaultProject = async (req: Request, res: Response) => {
  let id = 0;

  if (req.params.id) {
    id = Number(req.params.id);
  } else {
    id = req.user.id;
  }

  const project = await service.getUserDefaultProject(id);

  res.json({ id: project });
};

export const setUserDefaultProject = async (req: Request, res: Response) => {
  const result = await service.setUserDefaultProject(
    req.user.id,
    req.body.default_project_id,
  );

  res.json(result);
};
