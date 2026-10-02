import { Request, Response } from "express";
import * as service from "../services/reservation.service.ts";
import { parseQuery } from "utils/query.ts";
import { setGetListHeaders } from "utils/headers.ts";
import CustomError from "config/CustomError.ts";

export async function create(req: Request, res: Response) {
  const reservation = await service.create(
    {
      ...req.body,
      made_by: req.user.id,
    },
    req.user,
  );
  res.status(201).json(reservation);
}

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

export const destroy = async (req: Request, res: Response) => {
  const record = await service.destroy(Number(req.params.id), req.user);
  res.json(record);
};

export const update = async (req: Request, res: Response) => {
  //const record = await service.update(Number(req.params.id), req.body);
  //res.json(record);
  throw new CustomError({
    statusCode: 405,
    message: "Please delelete the reservation and create a new one",
  });
};
