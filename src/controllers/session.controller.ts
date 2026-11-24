import { Request, Response } from "express";
import * as service from "services/session.service.ts";

export const authorize = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.authorizeSession(req.body));
  } catch (err) {
    const e = err as { statusCode?: number; message: string };
    res
      .status(e.statusCode && e.statusCode < 500 ? e.statusCode : 403)
      .json({ message: e.message });
  }
};

export const report = async (req: Request, res: Response) => {
  const job = await service.reportSession(req.body);
  res
    .status(200)
    .json({ id: job.id, jobid: job.jobid, billable: job.billable });
};
