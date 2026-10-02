// https://github.com/nicgirault/express-crud-router/blob/master/src/getList/index.ts

import { Op } from "sequelize";

export type FiltersOption = Record<string, (value: unknown) => unknown>;

interface RawQuery {
  range?: unknown;
  sort?: unknown;
  filter?: unknown;
}

export const parseQuery = async (
  query: RawQuery,
  filtersOption: FiltersOption,
) => {
  const { range, sort, filter } = query;

  const [from, to] = range ? JSON.parse(range as string) : [0, 10000];

  return {
    offset: from,
    limit: to - from + 1,
    filter: await getFilter(
      JSON.parse((filter as string) || "{}"),
      filtersOption,
    ),
    order: [sort ? JSON.parse(sort as string) : ["id", "ASC"]] as [
      [string, string],
    ],
  };
};

export const mapFilterToSequelize = (filter: Record<string, unknown>) => {
  const result: Record<string, unknown> = {};

  for (const key in filter) {
    if (!Object.prototype.hasOwnProperty.call(filter, key)) continue;

    const value = filter[key];

    // Skip undefined/null values
    if (value === undefined || value === null) continue;

    // Handle operator suffixes
    if (key.endsWith("_gte")) {
      const field = key.replace("_gte", "");
      result[field] = {
        ...((result[field] as Record<string, unknown>) || {}),
        [Op.gte]: value,
      };
    } else if (key.endsWith("_lte")) {
      const field = key.replace("_lte", "");
      result[field] = {
        ...((result[field] as Record<string, unknown>) || {}),
        [Op.lte]: value,
      };
    } else if (key.endsWith("_gt")) {
      const field = key.replace("_gt", "");
      result[field] = {
        ...((result[field] as Record<string, unknown>) || {}),
        [Op.gt]: value,
      };
    } else if (key.endsWith("_lt")) {
      const field = key.replace("_lt", "");
      result[field] = {
        ...((result[field] as Record<string, unknown>) || {}),
        [Op.lt]: value,
      };
    } else if (key.endsWith("_ne")) {
      const field = key.replace("_ne", "");
      result[field] = {
        ...((result[field] as Record<string, unknown>) || {}),
        [Op.ne]: value,
      };
    } else {
      // Direct equality
      result[key] = value;
    }
  }

  return result;
};

const getFilter = async (
  filter: Record<string, unknown>,
  filtersOption: FiltersOption,
) => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filter)) {
    if (filtersOption && filtersOption[key]) {
      Object.assign(result, await filtersOption[key]!(value));
    } else {
      result[key] = value;
    }
  }

  return result;
};
