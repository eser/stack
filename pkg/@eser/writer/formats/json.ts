// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

export const writeStart = (options?: FormatOptions): string => {
  const indent = options?.pretty
    ? (options?.indent !== undefined ? options.indent : 2)
    : undefined;
  return indent !== undefined ? "[\n" : "[";
};

export const writeItem = (
  data: unknown,
  options?: FormatOptions,
): string => {
  try {
    const indent = options?.pretty
      ? (options?.indent !== undefined ? options.indent : 2)
      : undefined;
    const inArray = options?.["_inArray"] === true;
    const json = JSON.stringify(data, null, indent);

    if (inArray) {
      // Array mode: prefix with comma (except first item)
      const prefix = options?.["_isFirst"] === true ? "" : ",";
      const spacing = indent !== undefined ? "\n" : "";
      return prefix + spacing + json;
    }

    // Standalone mode: JSONL style (one object per line)
    return json + "\n";
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
  const indent = options?.pretty
    ? (options?.indent !== undefined ? options.indent : 2)
    : undefined;
  return indent !== undefined ? "\n]\n" : "]\n";
};

export const jsonFormat: WriterFormat = {
  name: "json",
  extensions: [".json"],
  writeStart,
  writeItem,
  writeEnd,
};
