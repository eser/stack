// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as toml from "@std/toml";
import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

export const serialize = (data: unknown, options?: FormatOptions): string => {
  try {
    // TOML requires the root to be an object
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("TOML format requires the root value to be an object");
    }

    const tomlOptions: toml.StringifyOptions = {};

    if (options?.pretty !== false) {
      // TOML is naturally pretty formatted, but we can control some aspects
      tomlOptions.keyAlignment = true;
    }

    return toml.stringify(data as Record<string, unknown>, tomlOptions);
  } catch (error) {
    throw new SerializationError(
      `Failed to serialize TOML: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "toml",
      error instanceof Error ? error : undefined,
    );
  }
};

export const tomlFormat: WriterFormat = {
  name: "toml",
  extensions: [".toml"],
  serialize,
};
