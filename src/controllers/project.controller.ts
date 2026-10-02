import { Request, Response } from "express";
import { parseQuery } from "utils/query.ts";
import { setGetListHeaders } from "utils/headers.ts";
import * as service from "../services/project.service.ts";

export const getList = async (req: Request, res: Response) => {
  const { limit, offset, filter, order } = await parseQuery(req.query, {});
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
  let budget = req.body.budget;
  if (budget) {
    // transform hours to seconds
    budget = budget * 60 * 60 * 1000;
  }
  const record = await service.create({ ...req.body, budget }, req.user);
  res.status(201).json(record);
};

export const update = async (req: Request, res: Response) => {
  const record = await service.update(Number(req.params.id), req.body);
  res.json(record);
};

export const getUserList = async (req: Request, res: Response) => {
  const { limit, offset, filter, order } = await parseQuery(req.query, {});
  const { rows, count } = await service.getUserList(
    req.user,
    Number(req.params.id),
    filter,
    Number(limit),
    Number(offset),
    order,
  );

  setGetListHeaders(res, offset, count, rows.length);

  res.json(rows);
};

export const getJobList = async (req: Request, res: Response) => {
  const { limit, offset, filter, order } = await parseQuery(req.query, {});
  const { rows, count } = await service.getJobList(
    req.user,
    Number(req.params.id),
    filter,
    Number(limit),
    Number(offset),
    order,
  );

  setGetListHeaders(res, offset, count, rows.length);

  res.json(rows);
};

export const getTransactionList = async (req: Request, res: Response) => {
  const { limit, offset, filter, order } = await parseQuery(req.query, {});
  const { rows, count } = await service.getTransactionList(
    req.user,
    Number(req.params.id),
    filter,
    Number(limit),
    Number(offset),
    order,
  );

  setGetListHeaders(res, offset, count, rows.length);

  res.json(rows);
};

export const addUser = async (req: Request, res: Response) => {
  const { email, admin } = req.body;

  const record = await service.addUser(req.user, Number(req.params.id), {
    email,
    admin,
  });

  res.status(201).json(record);
};
