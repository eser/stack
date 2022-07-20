import type Formatter from "./formatter.ts";

const names = [
  "text",
  "text/plain",
];

const serialize = async function serialize(
  payload: unknown | Promise<unknown>,
): Promise<string> {
  const awaitedPayload = await payload;

  const stringified = String(awaitedPayload);

  return stringified;
};

const textPlainFormatter: Formatter = {
  names,

  serialize,
};

export { textPlainFormatter, textPlainFormatter as default };
