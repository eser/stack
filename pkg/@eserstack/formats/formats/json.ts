// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Format, FormatOptions, FormatReader } from "../types.ts";
import { DeserializationError, SerializationError } from "../types.ts";

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

export const createReader = (_options?: FormatOptions): FormatReader => {
  let buffer = "";

  return {
    push(chunk: string): unknown[] {
      buffer += chunk;
      return [];
    },

    flush(): unknown[] {
      const text = buffer.trim();
      buffer = "";

      if (text.length === 0) {
        return [];
      }

      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (error) {
        throw new DeserializationError(
          `Failed to deserialize JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "json",
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
};

export const jsonFormat: Format = {
  name: "json",
  extensions: ["json"],
  streamable: false,
  writeStart,
  writeItem,
  writeEnd,
  createReader,
};
