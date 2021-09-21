import type Formatter from "./formatter.ts";

const names = [
  "json",
  "application/json",
];

function fixNonSerializableObjects(key: string, value: unknown): unknown {
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
}

async function serialize<T>(payload: T | Promise<T>): Promise<unknown> {
  const awaitedPayload = await payload;

  if (awaitedPayload === undefined) {
    return "";
  }

  return JSON.stringify(
    awaitedPayload,
    fixNonSerializableObjects,
    2,
  );
}

async function deserialize<T>(payload: unknown | Promise<unknown>): Promise<T> {
  const awaitedPayload = await payload;

  return JSON.parse(String(awaitedPayload));
}

const formatter: Formatter = {
  names,
  serialize,
  deserialize,
};

export { formatter as default };
