// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Format, FormatOptions, FormatReader } from "../types.ts";
import * as types from "../types.ts";
import * as csvCodec from "./csv-codec.ts";

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

const serializationError = (error: unknown): types.SerializationError =>
  new types.SerializationError(
    `Failed to serialize CSV: ${
      error instanceof Error ? error.message : String(error)
    }`,
    "csv",
    error instanceof Error ? error : undefined,
  );

export const writeStart = (options?: FormatOptions): string => {
  const headers = options?.headers;
  if (headers === undefined || headers.length === 0) {
    return "";
  }

  try {
    return csvCodec.formatRow(headers, options?.delimiter ?? ",");
  } catch (error) {
    throw serializationError(error);
  }
};

export const writeItem = (data: unknown, options?: FormatOptions): string => {
  const obj = normalizeToObject(data);
  if (obj === undefined) return "";

  try {
    const delimiter = options?.delimiter ?? ",";
    const headers = options?.headers ?? Object.keys(obj);
    const headersInStart = (options?.headers?.length ?? 0) > 0;
    const includeHeader = options?.["_isFirst"] === true && !headersInStart;

    const header = includeHeader ? csvCodec.formatRow(headers, delimiter) : "";
    return (
      header +
      csvCodec.formatRow(
        headers.map((name) => obj[name]),
        delimiter,
      )
    );
  } catch (error) {
    throw serializationError(error);
  }
};

export const writeEnd = (_options?: FormatOptions): string => {
  return "";
};

export const createReader = (options?: FormatOptions): FormatReader => {
  const delimiter = options?.delimiter ?? ",";
  let parser: csvCodec.RecordParser | undefined;
  let headers: readonly string[] | undefined = options?.headers;

  /** Turns records into objects keyed by the headers; the first record is the header row unless headers were given. */
  const toItems = (records: readonly string[][]): unknown[] => {
    const items: unknown[] = [];

    for (const record of records) {
      if (headers === undefined) {
        headers = record.map((name) => name.trim());
        continue;
      }

      if (record.length !== headers.length) {
        throw new Error(
          `The record has ${record.length} fields, but the header has ${headers.length} fields`,
        );
      }

      const item: Record<string, string> = {};
      for (const [index, name] of headers.entries()) {
        item[name] = record[index] ?? "";
      }
      items.push(item);
    }

    return items;
  };

  const read = (
    label: string,
    next: (parser: csvCodec.RecordParser) => string[][],
  ): unknown[] => {
    try {
      parser ??= csvCodec.createRecordParser(delimiter);

      return toItems(next(parser));
    } catch (error) {
      throw new types.DeserializationError(
        `Failed to deserialize ${label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "csv",
        error instanceof Error ? error : undefined,
      );
    }
  };

  return {
    push(chunk: string): unknown[] {
      return read("CSV row", (p) => p.push(chunk));
    },

    flush(): unknown[] {
      return read("CSV", (p) => p.flush());
    },
  };
};

export const csvFormat: Format = {
  name: "csv",
  extensions: ["csv"],
  streamable: true,
  writeStart,
  writeItem,
  writeEnd,
  createReader,
};
