// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Format, FormatOptions, FormatReader } from "../types.ts";
import * as types from "../types.ts";

const getIndent = (options?: FormatOptions): number | undefined => {
  if (options?.pretty !== true) return undefined;
  return options.indent ?? 2;
};

// serialize passes `_inArray: false` when the value is the whole document;
// then there is no array to open or close.
const isWholeDocument = (options?: FormatOptions): boolean =>
  options?.["_inArray"] === false;

// Shift every line of a pretty-printed item one level in, as
// JSON.stringify(array, null, indent) lays out array elements.
const indentLines = (json: string, indent: number): string => {
  const padding = " ".repeat(indent);
  return json.split("\n").map((line) => padding + line).join("\n");
};

export const writeStart = (options?: FormatOptions): string => {
  return isWholeDocument(options) ? "" : "[";
};

export const writeItem = (
  data: unknown,
  options?: FormatOptions,
): string => {
  const inArray = options?.["_inArray"] === true;
  const indent = getIndent(options);
  let json: string | undefined;

  try {
    json = JSON.stringify(data, null, indent);
  } catch (error) {
    throw new types.SerializationError(
      `serialize JSON: ${
        error instanceof Error ? error.message : String(error)
      }; pass plain data without cycles or BigInt values`,
      "json",
      error instanceof Error ? error : undefined,
    );
  }

  if (json === undefined) {
    // JSON.stringify writes null for such an array element and returns
    // undefined for such a document.
    if (inArray) {
      json = "null";
    } else {
      throw new types.SerializationError(
        `serialize JSON: a value of type ${typeof data} has no JSON form; pass an object, array, string, number, boolean or null`,
        "json",
      );
    }
  }

  if (!inArray) {
    return `${json}\n`;
  }

  const separator = options?.["_isFirst"] === true ? "" : ",";
  if (indent === undefined) {
    return separator + json;
  }

  return `${separator}\n${indentLines(json, indent)}`;
};

export const writeEnd = (options?: FormatOptions): string => {
  if (isWholeDocument(options)) return "";
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
        throw new types.DeserializationError(
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
