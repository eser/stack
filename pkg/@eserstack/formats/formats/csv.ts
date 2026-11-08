// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Format, FormatOptions, FormatReader } from "../types.ts";
import * as types from "../types.ts";
import * as ffiClient from "../ffi-client.ts";
import * as csvCodec from "./csv-codec.ts";

/** What a reader keeps between chunks, as `formatReadCsv` answers it. */
type FormatCsvState = {
  readonly rest: string;
  readonly headers: readonly string[] | null;
  readonly records: number;
};

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

/**
 * Creates a CSV reader. The reading runs in Go (`formatReadCsv` of the
 * bridge, over `formatfx.ReadCSV`); this reader keeps the state Go hands back
 * between chunks, so nothing stays open in Go when a reader is dropped
 * without a flush.
 *
 * The first record gives the header names, trimmed, unless `headers` is set.
 * Records are read with `delimiter` (a comma by default): LF or CRLF row
 * endings, quoted fields across line breaks and chunks, blank lines skipped.
 *
 * @throws {Error} From push and flush when the bridge is unavailable, with the
 *   load failure as `cause`
 * @throws {types.DeserializationError} From push and flush for text that
 *   breaks the quoting rules, a record of another width than the header, or a
 *   delimiter that is empty or holds a quote, CR or LF
 */
export const createReader = (options?: FormatOptions): FormatReader => {
  const delimiter = options?.delimiter ?? ",";
  let state: FormatCsvState = {
    rest: "",
    headers: options?.headers ?? null,
    records: 0,
  };

  const read = (label: string, chunk: string, final: boolean): unknown[] => {
    const answer = ffiClient
      .requireLibSync()
      .call("formatReadCsv", { chunk, final, delimiter, state });

    if (typeof answer.error === "string" && answer.error.length > 0) {
      throw new types.DeserializationError(
        `Failed to deserialize ${label}: ${answer.error}`,
        "csv",
        new Error(answer.error),
      );
    }

    state = answer.state ?? state;

    return [...(answer.items ?? [])];
  };

  return {
    push(chunk: string): unknown[] {
      return read("CSV row", chunk, false);
    },

    flush(): unknown[] {
      return read("CSV", "", true);
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
