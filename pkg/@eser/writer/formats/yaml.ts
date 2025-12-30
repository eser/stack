// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as yaml from "@std/yaml";
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
    const yamlOptions: yaml.StringifyOptions = {};

    if (options?.indent !== undefined) {
      yamlOptions.indent = options.indent;
    }

    const separator = options?.separator === "" ? "---" : (options?.separator ??
      "---");
    return `${yaml.stringify(data, yamlOptions).trim()}\n${separator}\n`;
  } catch (error) {
    throw new SerializationError(
      `Failed to serialize YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "yaml",
      error instanceof Error ? error : undefined,
    );
  }
};

export const writeEnd = (_options?: FormatOptions): string => {
  return "";
};

export const yamlFormat: WriterFormat = {
  name: "yaml",
  extensions: [".yaml", ".yml"],
  writeStart,
  writeItem,
  writeEnd,
};
