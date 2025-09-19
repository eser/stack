// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as csv from "@std/csv";
import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

const normalizeToObjects = (data: unknown): Record<string, unknown>[] => {
  if (Array.isArray(data)) {
    if (data.length === 0) return [];

    // If array contains objects, return as is
    if (
      typeof data[0] === "object" && data[0] !== null && !Array.isArray(data[0])
    ) {
      return data as Record<string, unknown>[];
    }

    // If array contains primitives, create objects with index
    return data.map((item, index) => ({ index, value: item }));
  }

  // If single object, wrap in array
  if (typeof data === "object" && data !== null) {
    return [data as Record<string, unknown>];
  }

  // For primitives, create single object
  return [{ value: data }];
};

export const serialize = (data: unknown, options?: FormatOptions): string => {
  try {
    const objects = normalizeToObjects(data);
    if (objects.length === 0) {
      return "";
    }

    const delimiter = options?.delimiter ?? ",";
    const headers = options?.headers;

    let csvHeaders: string[];

    if (headers) {
      csvHeaders = headers;
    } else {
      // Auto-detect headers from first object
      csvHeaders = Object.keys(objects[0] || {});
    }

    const csvOptions: csv.StringifyOptions = {
      separator: delimiter,
      headers: true,
      columns: csvHeaders,
    };

    return csv.stringify(objects, csvOptions);
  } catch (error) {
    throw new SerializationError(
      `Failed to serialize CSV: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "csv",
      error instanceof Error ? error : undefined,
    );
  }
};
export const csvFormat: WriterFormat = {
  name: "csv",
  extensions: [".csv"],
  serialize,
};
