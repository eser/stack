// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as csv from "@std/csv";
import type { FormatOptions, WriterFormat } from "../types.ts";
import { SerializationError } from "../types.ts";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && value !== undefined && value.constructor === Object;

const normalizeToObject = (
  data: unknown,
): Record<string, unknown> | undefined => {
  if (isPlainObject(data)) {
    return data;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return undefined;
    if (isPlainObject(data[0])) return data[0];
    return { value: data[0] };
  }

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
  const obj = normalizeToObject(data);
  if (obj === undefined) return "";

  try {
    const headers = options?.headers ?? Object.keys(obj);
    const headersInStart = (options?.headers?.length ?? 0) > 0;
    const includeHeader = options?.["_isFirst"] === true && !headersInStart;

    return csv.stringify([obj], {
      separator: options?.delimiter ?? ",",
      headers: includeHeader,
      columns: headers,
    });
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
