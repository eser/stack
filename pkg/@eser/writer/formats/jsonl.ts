// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

export const writeStart = (_options?: FormatOptions): string => {
  return "";
};

export const writeItem = (
  data: unknown,
  _options?: FormatOptions,
): string => {
  try {
    // JSONL: one compact JSON object per line (no pretty printing)
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

export const jsonlFormat: WriterFormat = {
  name: "jsonl",
  extensions: [".jsonl", ".ndjson"],
  writeStart,
  writeItem,
  writeEnd,
};
