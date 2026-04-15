// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Format, FormatOptions, FormatReader } from "../types.ts";
import { DeserializationError, SerializationError } from "../types.ts";

export const writeStart = (_options?: FormatOptions): string => {
  return "";
};

export const writeItem = (
  data: unknown,
  _options?: FormatOptions,
): string => {
  try {
    return JSON.stringify(data) + "\n";
  } catch (error) {
    throw new SerializationError(
      `Failed to serialize JSONL: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "jsonl",
      error instanceof Error ? error : undefined,
    );
  }
};

export const writeEnd = (_options?: FormatOptions): string => {
  return "";
};

export const createReader = (_options?: FormatOptions): FormatReader => {
  let buffer = "";

  return {
    push(chunk: string): unknown[] {
      buffer += chunk;
      const items: unknown[] = [];

      // Split on newlines, keep last incomplete line in buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;

        try {
          items.push(JSON.parse(trimmed));
        } catch (error) {
          throw new DeserializationError(
            `Failed to deserialize JSONL line: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "jsonl",
            error instanceof Error ? error : undefined,
          );
        }
      }

      return items;
    },

    flush(): unknown[] {
      const trimmed = buffer.trim();
      buffer = "";

      if (trimmed.length === 0) {
        return [];
      }

      try {
        return [JSON.parse(trimmed)];
      } catch (error) {
        throw new DeserializationError(
          `Failed to deserialize JSONL line: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "jsonl",
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
};

export const jsonlFormat: Format = {
  name: "jsonl",
  extensions: ["jsonl", "ndjson"],
  streamable: true,
  writeStart,
  writeItem,
  writeEnd,
  createReader,
};
