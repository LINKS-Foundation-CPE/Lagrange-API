import { Request, Response } from "express";
import * as service from "services/jobReport.service.ts";

export async function create(req: Request, res: Response) {
  await service.create(req.body);
  res.status(200).end(); //.json(record);
}

export const update = async (req: Request, res: Response) => {
  await service.update(req.params.jobid, req.body);
  res.status(200).end();
};
