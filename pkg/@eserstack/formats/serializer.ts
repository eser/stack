// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { WriteOptions } from "./types.ts";
import * as types from "./types.ts";
import * as formatRegistry from "./format-registry.ts";
import * as ffiClient from "./ffi-client.ts";

// Trim the separator YAML (---) and TOML (+++) write after their last document.
const trimTrailingSeparator = (output: string): string => {
  return output.replace(/\n(---|\+\+\+)\n$/, "\n");
};

/** The loaded native library, as `ffiClient.getLib()` returns it. */
export type NativeLibrary = NonNullable<ReturnType<typeof ffiClient.getLib>>;

/**
 * Encodes through the Go formats. Returns null when Go reports an error or the
 * call itself fails, so the caller can try the TypeScript format instead; a
 * custom format registered only in TypeScript takes that path.
 */
const encodeNative = (
  lib: NativeLibrary,
  data: unknown,
  format: string,
  options?: WriteOptions,
): string | null => {
  const pretty = options?.pretty ?? false;
  const indent = options?.indent ?? 0;

  try {
    // An array is a list of items: WriteStart, WriteItem per item, WriteEnd.
    // Any other value is one whole document, written by a single WriteItem.
    const parsed = Array.isArray(data)
      ? lib.call("formatEncodeDocument", {
          format,
          items: data,
          pretty,
          indent,
        })
      : lib.call("formatEncode", {
          format,
          data,
          pretty,
          indent,
          isFirst: true,
          document: true,
        });

    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return null;
    }

    return trimTrailingSeparator(parsed.result ?? "");
  } catch {
    // A library without these names, or a refused call, leaves the
    // TypeScript formats to do the work, the same as a Go-side error.
    return null;
  }
};

/**
 * Serializes `data` with an already loaded native library, or with only the
 * TypeScript formats when `lib` is null. {@link serialize} loads the library
 * and calls this; tests call it to reach either path.
 */
export const serializeWith = (
  lib: NativeLibrary | null,
  data: unknown,
  format: string,
  options?: WriteOptions,
): string => {
  if (lib !== null) {
    const encoded = encodeNative(lib, data, format, options);
    if (encoded !== null) {
      return encoded;
    }
  }

  const formatAdapter = formatRegistry.getFormat(format);
  if (formatAdapter === undefined) {
    throw new types.FormatNotFoundError(format);
  }

  // `_inArray` false tells the format that the value is the whole document,
  // so JSON leaves out the array brackets around it.
  const isList = Array.isArray(data);
  const documentOptions: WriteOptions = { ...options, _inArray: isList };
  const chunks: string[] = [];

  const startOutput = formatAdapter.writeStart?.(documentOptions) ?? "";
  if (startOutput !== "") chunks.push(startOutput);

  const items: readonly unknown[] = isList ? data : [data];
  for (const [index, item] of items.entries()) {
    chunks.push(
      formatAdapter.writeItem(item, {
        ...documentOptions,
        _isFirst: index === 0,
      }),
    );
  }

  const endOutput = formatAdapter.writeEnd?.(documentOptions) ?? "";
  if (endOutput !== "") chunks.push(endOutput);

  return trimTrailingSeparator(chunks.join(""));
};

/**
 * Serializes `data` in the named format.
 *
 * An array becomes a list of its items: a JSON array, YAML sequence entries
 * (Go) or YAML documents (TypeScript), CSV rows, JSONL lines or TOML tables
 * separated by `+++` lines. Any other value becomes a single document, so
 * `serialize({ a: 1 }, "json")` returns `{"a":1}` followed by a newline. The
 * package README lists where the Go and TypeScript output differ.
 *
 * The Go encoders in `@eserstack/ajan` do the work when the native library
 * loads and knows the format; otherwise the format from the registry does.
 *
 * @throws {types.FormatNotFoundError} when neither side knows the format
 * @throws {types.SerializationError} when the format cannot encode the value
 */
export const serialize = async (
  data: unknown,
  format: string,
  options?: WriteOptions,
): Promise<string> => {
  await ffiClient.ensureLib();

  return serializeWith(ffiClient.getLib(), data, format, options);
};
