// https://github.com/nicgirault/express-crud-router/blob/master/src/getList/index.ts

type FiltersOption = Record<string, (value: unknown) => unknown>;

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
