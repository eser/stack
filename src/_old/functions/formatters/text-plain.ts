import type { HexFunctionResult } from "../abstractions/functionResult.ts";

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

async function formatter(result: HexFunctionResult): Promise<string> {
  // if (result === undefined) {
  //   return "";
  // }

  const awaitedResult = await result;

  if (awaitedResult === undefined) {
    return "";
  }

  return JSON.stringify(
    awaitedResult,
    fixNonSerializableObjects,
    2,
  );
}

export { formatter };
