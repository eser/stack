// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

const getIndent = (options?: FormatOptions): number | undefined => {
  if (!options?.pretty) return undefined;
  return options.indent ?? 2;
};

export const writeStart = (options?: FormatOptions): string => {
  return getIndent(options) !== undefined ? "[\n" : "[";
};

export const writeItem = (
  data: unknown,
  options?: FormatOptions,
): string => {
  try {
    const indent = getIndent(options);
    const json = JSON.stringify(data, null, indent);

    if (options?.["_inArray"] !== true) {
      return json + "\n";
    }

    const prefix = options?.["_isFirst"] === true ? "" : ",";
    const spacing = indent !== undefined ? "\n" : "";
    return prefix + spacing + json;
  } catch (error) {
    throw new SerializationError(
      `Failed to serialize JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "json",
      error instanceof Error ? error : undefined,
    );
  }
};

export const writeEnd = (options?: FormatOptions): string => {
  return getIndent(options) !== undefined ? "\n]\n" : "]\n";
};

export const jsonFormat: WriterFormat = {
  name: "json",
  extensions: [".json"],
  writeStart,
  writeItem,
  writeEnd,
};
