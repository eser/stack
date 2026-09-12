// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { callJson } from "@eserstack/ajan/ffi/client";
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

const isMissingFormat = (msg: string): boolean =>
  msg.includes("format not found") || msg.includes("not registered") ||
  msg.includes("not found in registry");

/**
 * The bridge reports a missing format the same way it reports any other
 * failure, so the code is recovered from the message. Each operation keeps its
 * own fallback code, which is why this is a factory rather than one shared
 * mapper.
 */
const errorsFor = (fallbackCode: string) => ({
  onUnavailable: (): Error =>
    new FormatFfiError("native library unavailable", fallbackCode),
  onError: (msg: string): Error =>
    new FormatFfiError(
      msg,
      isMissingFormat(msg) ? FORMAT_NOT_FOUND : fallbackCode,
    ),
});

export const ffiFormats: Loader = {
  async encode(
    format: string,
    data: unknown,
    opts?: FormatEncodeOptions,
  ): Promise<string> {
    const result = await callJson<{ result?: string }>(
      (lib) =>
        lib.symbols.EserAjanFormatEncode(
          JSON.stringify({
            format,
            data,
            pretty: opts?.pretty ?? false,
            indent: opts?.indent ?? 0,
            isFirst: opts?.isFirst ?? false,
          }),
        ),
      errorsFor(FORMAT_ENCODE_FAILED),
    );

    return result.result ?? "";
  },

  async encodeDocument(
    format: string,
    items: unknown[],
    opts?: FormatEncodeDocumentOptions,
  ): Promise<string> {
    const result = await callJson<{ result?: string }>(
      (lib) =>
        lib.symbols.EserAjanFormatEncodeDocument(
          JSON.stringify({
            format,
            items,
            pretty: opts?.pretty ?? false,
            indent: opts?.indent ?? 0,
          }),
        ),
      errorsFor(FORMAT_ENCODE_FAILED),
    );

    return result.result ?? "";
  },

  async decode(format: string, text: string): Promise<unknown[]> {
    const result = await callJson<{ items?: unknown[] }>(
      (lib) =>
        lib.symbols.EserAjanFormatDecode(JSON.stringify({ format, text })),
      errorsFor(FORMAT_DECODE_FAILED),
    );

    return result.items ?? [];
  },

  async list(): Promise<FormatListItem[]> {
    const result = await callJson<{ formats?: FormatListItem[] }>(
      (lib) => lib.symbols.EserAjanFormatList(),
      errorsFor(FORMAT_LIST_FAILED),
    );

    return result.formats ?? [];
  },
};
