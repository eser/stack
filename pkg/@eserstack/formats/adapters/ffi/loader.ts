// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ffi from "@eserstack/ajan/ffi";
import type {
  FormatEncodeDocumentOptions,
  FormatEncodeOptions,
  FormatListItem,
  Loader,
} from "../../business/formats.ts";
import {
  FORMAT_DECODE_FAILED,
  FORMAT_ENCODE_FAILED,
  FORMAT_LIST_FAILED,
  FORMAT_NOT_FOUND,
  FormatFfiError,
} from "../../business/errors.ts";

let _lib: ffi.FFILibrary | null = null;
let _libPromise: Promise<void> | null = null;

const ensureLib = (): Promise<void> => {
  if (_libPromise === null) {
    _libPromise = ffi
      .loadEserAjan()
      .then((lib) => {
        _lib = lib;
      })
      .catch(() => {});
  }
  return _libPromise;
};

const getLib = (): ffi.FFILibrary | null => _lib;

const mapEncodeErrorCode = (msg: string): string => {
  if (msg.includes("format not found") || msg.includes("not registered") || msg.includes("not found in registry")) return FORMAT_NOT_FOUND;
  return FORMAT_ENCODE_FAILED;
};

const mapDecodeErrorCode = (msg: string): string => {
  if (msg.includes("format not found") || msg.includes("not registered") || msg.includes("not found in registry")) return FORMAT_NOT_FOUND;
  return FORMAT_DECODE_FAILED;
};

export const ffiFormats: Loader = {
  async encode(
    format: string,
    data: unknown,
    opts?: FormatEncodeOptions,
  ): Promise<string> {
    await ensureLib();
    const lib = getLib();
    if (lib === null) {
      throw new FormatFfiError("native library unavailable", FORMAT_ENCODE_FAILED);
    }

    const raw = lib.symbols.EserAjanFormatEncode(
      JSON.stringify({
        format,
        data,
        pretty: opts?.pretty ?? false,
        indent: opts?.indent ?? 0,
        isFirst: opts?.isFirst ?? false,
      }),
    );
    const result = JSON.parse(raw) as { result?: string; error?: string };
    if (result.error) {
      throw new FormatFfiError(result.error, mapEncodeErrorCode(result.error));
    }
    return result.result ?? "";
  },

  async encodeDocument(
    format: string,
    items: unknown[],
    opts?: FormatEncodeDocumentOptions,
  ): Promise<string> {
    await ensureLib();
    const lib = getLib();
    if (lib === null) {
      throw new FormatFfiError("native library unavailable", FORMAT_ENCODE_FAILED);
    }

    const raw = lib.symbols.EserAjanFormatEncodeDocument(
      JSON.stringify({
        format,
        items,
        pretty: opts?.pretty ?? false,
        indent: opts?.indent ?? 0,
      }),
    );
    const result = JSON.parse(raw) as { result?: string; error?: string };
    if (result.error) {
      throw new FormatFfiError(result.error, mapEncodeErrorCode(result.error));
    }
    return result.result ?? "";
  },

  async decode(format: string, text: string): Promise<unknown[]> {
    await ensureLib();
    const lib = getLib();
    if (lib === null) {
      throw new FormatFfiError("native library unavailable", FORMAT_DECODE_FAILED);
    }

    const raw = lib.symbols.EserAjanFormatDecode(JSON.stringify({ format, text }));
    const result = JSON.parse(raw) as { items?: unknown[]; error?: string };
    if (result.error) {
      throw new FormatFfiError(result.error, mapDecodeErrorCode(result.error));
    }
    return result.items ?? [];
  },

  async list(): Promise<FormatListItem[]> {
    await ensureLib();
    const lib = getLib();
    if (lib === null) {
      throw new FormatFfiError("native library unavailable", FORMAT_LIST_FAILED);
    }

    const raw = lib.symbols.EserAjanFormatList();
    const result = JSON.parse(raw) as {
      formats?: { name: string; extensions: string[]; streamable: boolean }[];
      error?: string;
    };
    if (result.error) {
      throw new FormatFfiError(result.error, FORMAT_LIST_FAILED);
    }
    return result.formats ?? [];
  },
};
