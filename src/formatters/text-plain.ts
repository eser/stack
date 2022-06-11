import type Formatter from "./formatter.ts";

const names = [
  "text",
  "text/plain",
];

const serialize = async function serialize<T>(
  payload: T | Promise<T>,
): Promise<unknown> {
  const awaitedPayload = await payload;

  const stringified = String(awaitedPayload) as unknown;

  return stringified as T;
};

const deserialize = async function deserialize<T>(
  payload: unknown | Promise<unknown>,
): Promise<T> {
  const awaitedPayload = await payload;

  // @ts-ignore it should be string
  return String(awaitedPayload);
};

const textPlainFormatter: Formatter = {
  names,
  serialize,
  deserialize,
};

export { textPlainFormatter, textPlainFormatter as default };
