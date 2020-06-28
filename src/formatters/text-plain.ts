import HexFunctionResult from "../types/functionResult.ts";

function fixNonSerializableObjects(key: string, value: any): any {
  if (value instanceof Error) {
    const error: Record<string, unknown> = {};

    Object.getOwnPropertyNames(value).forEach(function (key: string) {
      error[key] = (value as any)[key];
    });

    return error;
  }

  return value;
}

async function formatter(result: HexFunctionResult): Promise<string> {
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

export {
  formatter as default,
};
