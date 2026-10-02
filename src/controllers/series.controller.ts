import { Request, Response } from "express";
import * as series from "../services/series.service.ts";

/** 200 for a preview, 201 when the series was created, 409 with the report when refused. */
const STATUS = { preview: 200, created: 201, refused: 409 } as const;

export async function createSlotSeries(req: Request, res: Response) {
  const result = await series.createSlotSeries(req.body, req.user);
  res.status(STATUS[result.outcome]).json(result);
}

export async function destroySlotSeries(req: Request, res: Response) {
  res.json(
    await series.destroySlotSeries(String(req.params.seriesId), req.user),
  );
}

export async function createReservationSeries(req: Request, res: Response) {
  const result = await series.createReservationSeries(req.body, req.user);
  res.status(STATUS[result.outcome]).json(result);
}

export async function destroyReservationSeries(req: Request, res: Response) {
  res.json(
    await series.destroyReservationSeries(
      String(req.params.seriesId),
      req.user,
    ),
  );
}
