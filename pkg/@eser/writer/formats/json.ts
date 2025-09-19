// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

export const serialize = (data: unknown, options?: FormatOptions): string => {
  try {
    const indent = options?.pretty
      ? (options?.indent !== undefined ? options.indent : 2)
      : undefined;

    return JSON.stringify(data, null, indent);
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

export const jsonFormat: WriterFormat = {
  name: "json",
  extensions: [".json"],
  serialize,
};
