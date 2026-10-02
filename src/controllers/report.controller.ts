import { Request, Response } from "express";
import * as service from "services/report.service.ts";
import { setGetListHeaders } from "utils/headers.ts";
import { ReportQueryDto } from "schemas/report.schema.ts";

/**
 * Reports are aggregates, not pages: the whole period is returned in one
 * response. `Content-Range` is still emitted so a react-admin data provider
 * can consume them like any other list.
 */
const sendReport = (res: Response, rows: unknown[]) => {
  setGetListHeaders(res, 0, rows.length, rows.length);
  res.json(rows);
};

const query = (req: Request) => req.validatedQuery as ReportQueryDto;

export const getReservations = async (req: Request, res: Response) =>
  sendReport(res, await service.reservations(req.user, query(req)));

export const getJobs = async (req: Request, res: Response) =>
  sendReport(res, await service.jobs(req.user, query(req)));

export const getSlots = async (req: Request, res: Response) =>
  sendReport(res, await service.slots(req.user, query(req)));

export const getUtilization = async (req: Request, res: Response) =>
  sendReport(res, await service.utilization(req.user, query(req)));

export const getSummary = async (req: Request, res: Response) => {
  res.json(await service.summary(req.user, query(req)));
};
