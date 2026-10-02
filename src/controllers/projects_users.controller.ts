import { Request, Response } from "express";
import * as service from "../services/project.service.ts";

export const update = async (req: Request, res: Response) => {
  const record = await service.updateProjectUser(
    req.user,
    Number(req.params.id),
    req.body,
  );
  res.json(record);
};

export const destroy = async (req: Request, res: Response) => {
  const record = await service.deleteProjectUser(
    req.user,
    Number(req.params.id),
  );
  res.json(record);
};
