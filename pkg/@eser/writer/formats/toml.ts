// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as toml from "@std/toml";
import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

export const writeStart = (_options?: FormatOptions): string => {
  return "";
};

export const writeItem = (
  data: unknown,
  options?: FormatOptions,
): string => {
  try {
    if (typeof data !== "object" || data === null) {
      throw new Error("TOML format requires each document to be an object");
    }

    const tomlOptions: toml.StringifyOptions = {};

    if (options?.pretty !== false) {
      tomlOptions.keyAlignment = true;
    }

    const separator = options?.separator === "" ? "+++" : (options?.separator ??
      "+++");
    return toml.stringify(data as Record<string, unknown>, tomlOptions).trim() +
      "\n" + separator + "\n";
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

export const writeEnd = (_options?: FormatOptions): string => {
  return "";
};

export const tomlFormat: WriterFormat = {
  name: "toml",
  extensions: [".toml"],
  writeStart,
  writeItem,
  writeEnd,
};
