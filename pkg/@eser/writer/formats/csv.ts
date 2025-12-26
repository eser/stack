// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as csv from "@std/csv";
import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

const normalizeToObject = (
  data: unknown,
): Record<string, unknown> | undefined => {
  if (Array.isArray(data)) {
    if (data.length === 0) return undefined;

    // If array contains objects, return first
    if (
      typeof data[0] === "object" && data[0] !== null && !Array.isArray(data[0])
    ) {
      return data[0] as Record<string, unknown>;
    }

    // If array contains primitives, create object with value
    return { value: data[0] };
  }

  // If single object, return as is
  if (typeof data === "object" && data !== null) {
    return data as Record<string, unknown>;
  }

  // For primitives, create single object
  return { value: data };
};

export const writeStart = (options?: FormatOptions): string => {
  // If headers are explicitly provided, output them
  const headers = options?.headers;
  if (headers !== undefined && headers.length > 0) {
    const delimiter = options?.delimiter ?? ",";
    return headers.join(delimiter) + "\n";
  }
  return "";
};

export const writeItem = (
  data: unknown,
  options?: FormatOptions,
): string => {
  try {
    const obj = normalizeToObject(data);
    if (obj === undefined) {
      return "";
    }

    const delimiter = options?.delimiter ?? ",";
    const headers = options?.headers ?? Object.keys(obj);

    // Include header row if _isFirst and headers weren't output by writeStart
    const headersInStart = options?.headers !== undefined &&
      options.headers.length > 0;
    const includeHeader = options?.["_isFirst"] === true && !headersInStart;

    const csvOptions: csv.StringifyOptions = {
      separator: delimiter,
      headers: includeHeader,
      columns: headers,
    };

    return csv.stringify([obj], csvOptions);
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

export const writeEnd = (_options?: FormatOptions): string => {
  return "";
};

export const csvFormat: WriterFormat = {
  name: "csv",
  extensions: [".csv"],
  writeStart,
  writeItem,
  writeEnd,
};
