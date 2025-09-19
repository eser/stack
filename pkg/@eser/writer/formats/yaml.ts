// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as yaml from "@std/yaml";
import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

export const serialize = (data: unknown, options?: FormatOptions): string => {
  try {
    const yamlOptions: yaml.StringifyOptions = {};

    if (options?.indent !== undefined) {
      yamlOptions.indent = options.indent;
    }

    // Handle array of documents with separator
    if (Array.isArray(data) && options?.separator !== undefined) {
      const docs = data.map((item) => yaml.stringify(item, yamlOptions).trim());
      return docs.join(`\n${options.separator}\n`) + "\n";
    }

    return yaml.stringify(data, yamlOptions);
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

export const yamlFormat: WriterFormat = {
  name: "yaml",
  extensions: [".yaml", ".yml"],
  serialize,
};
