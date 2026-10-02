import { Request, Response } from "express";
import * as service from "../services/metrics.service.ts";

/**
 * Prometheus text exposition format.
 *
 * No `# HELP` / `# TYPE` lines: the series here have always been untyped and
 * adding types now would change how existing dashboards read them.
 */

/** Label values are quoted, so a quote, a backslash or a newline must escape. */
const escapeLabelValue = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

/**
 * Metric names admit only `[a-zA-Z0-9_:]`. Job statuses are free text reported
 * by the gateway and end up in the name, so anything else is folded to `_`
 * rather than emitted verbatim — one malformed line makes Prometheus reject the
 * whole scrape, taking every other series with it.
 */
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9_:]/g, "_");

const renderLabels = (labels?: Record<string, string>) => {
  if (!labels) return "";
  const pairs = Object.entries(labels).map(
    ([key, value]) => `${safeName(key)}="${escapeLabelValue(value)}"`,
  );
  return `{${pairs.join(",")}}`;
};

export const getMetrics = async (req: Request, res: Response) => {
  const samples = await service.getSamples();
  const output = samples
    .map((s) => `${safeName(s.name)}${renderLabels(s.labels)} ${s.value}`)
    .join("\n");
  res.type("text/plain");
  res.send(output);
};
