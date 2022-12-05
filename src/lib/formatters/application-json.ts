import { type Formatter } from "./formatter.ts";

const names = [
  "json",
  "application/json",
];

const fixNonSerializableObjects = (
  _key: string,
  value: unknown,
): unknown => {
  if (value instanceof Error) {
    return Object.getOwnPropertyNames(value).reduce(
      (acc: Record<string, unknown>, curr: string) => ({
        ...acc,
        [curr]: ((value as unknown) as { [key: string]: unknown })[curr],
      }),
      {},
    );
  }

  return value;
};

const serialize = async (
  payload: unknown | Promise<unknown>,
): Promise<string> => {
  const awaitedPayload = await payload;

  if (awaitedPayload === undefined) {
    return "";
  }

  return JSON.stringify(
    awaitedPayload,
    fixNonSerializableObjects,
    2,
  );
};

const deserialize = async (
  payload: string | Promise<string>,
): Promise<unknown> => {
  const awaitedPayload = await payload;

  return JSON.parse(String(awaitedPayload));
};

const applicationJsonFormatter: Formatter<unknown, string> = {
  names,

  serialize,
  deserialize,
};

export { applicationJsonFormatter, applicationJsonFormatter as default };
