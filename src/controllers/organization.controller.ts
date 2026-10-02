import { Request, Response } from "express";
import * as service from "../services/organization.service.ts";
import { parseQuery } from "utils/query.ts";
import { setGetListHeaders } from "utils/headers.ts";

export const getList = async (req: Request, res: Response) => {
  //try {
  // const { filter = {}, limit, offset, order } = req.query;
  // parseQuery
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
  const organizatios = await service.getOne(Number(req.params.id));
  res.json(organizatios);
};

export const create = async (req: Request, res: Response) => {
  const organization = await service.create(req.body, req.user);
  res.status(201).json(organization);
};

export const update = async (req: Request, res: Response) => {
  const organization = await service.update(Number(req.params.id), req.body);
  res.json(organization);
};

export const budgetTransfer = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { sourceProjectId, destinationProjectId, amount } = req.body;

  const result = await service.transferBudget(
    req.user,
    Number(id),
    sourceProjectId,
    destinationProjectId,
    amount,
  );

  res.status(201).json({ message: "ok" });
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
