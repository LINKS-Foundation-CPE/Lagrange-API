import { Request, Response } from "express";
import * as jobAuthorizerService from "../services/jobAuthorizer.service.ts";

export const authorizeJob = async (req: Request, res: Response) => {
  try {
    const authorized = await jobAuthorizerService.authorizeJob(req);
    res.status(200).end();
  } catch (err) {
    res.status(403).json({ message: (err as Error).message });
  }
};
