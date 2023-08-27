import { type Formatter } from "./formatter.ts";

const names = [
  "text",
  "text/plain",
];

const serialize = async (
  payload: unknown | Promise<unknown>,
): Promise<string> => {
  const awaitedPayload = await payload;

  const stringified = String(awaitedPayload);

  return stringified;
};

export const textPlainFormatter: Formatter = {
  names,

  serialize,
};

export { textPlainFormatter as default };
