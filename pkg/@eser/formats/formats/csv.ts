// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as csv from "@std/csv";
import type { Format, FormatOptions, FormatReader } from "../types.ts";
import { DeserializationError, SerializationError } from "../types.ts";

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

export const createReader = (options?: FormatOptions): FormatReader => {
  let buffer = "";
  let headers: string[] | undefined = options?.headers;
  let headersParsed = headers !== undefined;

  return {
    push(chunk: string): unknown[] {
      buffer += chunk;
      const items: unknown[] = [];
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;

        // First non-empty line becomes headers (unless provided via options)
        if (!headersParsed) {
          const separator = options?.delimiter ?? ",";
          headers = trimmed.split(separator).map((h) => h.trim());
          headersParsed = true;
          continue;
        }

        try {
          const parsed = csv.parse(trimmed, {
            separator: options?.delimiter ?? ",",
            columns: headers,
          });
          items.push(...parsed);
        } catch (error) {
          throw new DeserializationError(
            `Failed to deserialize CSV row: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "csv",
            error instanceof Error ? error : undefined,
          );
        }
      }

      return items;
    },

    flush(): unknown[] {
      const trimmed = buffer.trim();
      buffer = "";

      if (trimmed.length === 0) {
        return [];
      }

      if (!headersParsed) {
        // Only had a header line, no data
        return [];
      }

      try {
        const parsed = csv.parse(trimmed, {
          separator: options?.delimiter ?? ",",
          columns: headers,
        });
        return parsed;
      } catch (error) {
        throw new DeserializationError(
          `Failed to deserialize CSV: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "csv",
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
};

export const csvFormat: Format = {
  name: "csv",
  extensions: [".csv"],
  streamable: true,
  writeStart,
  writeItem,
  writeEnd,
  createReader,
};
