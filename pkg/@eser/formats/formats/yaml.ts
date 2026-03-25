// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as yaml from "@std/yaml";
import type { Format, FormatOptions, FormatReader } from "../types.ts";
import { DeserializationError, SerializationError } from "../types.ts";

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

export const createReader = (_options?: FormatOptions): FormatReader => {
  let buffer = "";

  const parseDocument = (text: string): unknown[] => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];

    try {
      return [yaml.parse(trimmed)];
    } catch (error) {
      throw new DeserializationError(
        `Failed to deserialize YAML: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "yaml",
        error instanceof Error ? error : undefined,
      );
    }
  };

  return {
    push(chunk: string): unknown[] {
      buffer += chunk;
      const items: unknown[] = [];
      const separator = "\n---\n";

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf(separator)) !== -1) {
        const doc = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + separator.length);
        items.push(...parseDocument(doc));
      }

      return items;
    },

    flush(): unknown[] {
      const remaining = buffer;
      buffer = "";

      // Remove trailing separator if present
      const cleaned = remaining.replace(/\n---\n?$/, "");
      return parseDocument(cleaned);
    },
  };
};

export const yamlFormat: Format = {
  name: "yaml",
  extensions: [".yaml", ".yml"],
  streamable: false,
  writeStart,
  writeItem,
  writeEnd,
  createReader,
};
