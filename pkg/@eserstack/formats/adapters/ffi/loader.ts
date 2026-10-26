// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as client from "@eserstack/ajan/ffi/client";
import type {
  FormatEncodeDocumentOptions,
  FormatEncodeOptions,
  FormatListItem,
  Loader,
} from "../../business/formats.ts";
import * as errors from "../../business/errors.ts";

const isMissingFormat = (msg: string): boolean =>
  msg.includes("format not found") ||
  msg.includes("not registered") ||
  msg.includes("not found in registry");

/**
 * The bridge reports a missing format the same way it reports any other
 * failure, so the code is recovered from the message. Each operation keeps its
 * own fallback code, which is why this is a factory rather than one shared
 * mapper.
 */
const errorsFor = (fallbackCode: string) => ({
  onUnavailable: (): Error =>
    new errors.FormatFfiError("native library unavailable", fallbackCode),
  onError: (msg: string): Error =>
    new errors.FormatFfiError(
      msg,
      isMissingFormat(msg) ? errors.FORMAT_NOT_FOUND : fallbackCode,
    ),
});

export const ffiFormats: Loader = {
  encode: async (
    format: string,
    data: unknown,
    opts?: FormatEncodeOptions,
  ): Promise<string> => {
    const result = await client.callJson<{ result?: string }>(
      (lib) =>
        lib.call("formatEncode", {
          format,
          data,
          pretty: opts?.pretty ?? false,
          indent: opts?.indent ?? 0,
          isFirst: opts?.isFirst ?? false,
          document: opts?.document ?? false,
        }),
      errorsFor(errors.FORMAT_ENCODE_FAILED),
    );

    return result.result ?? "";
  },

  encodeDocument: async (
    format: string,
    items: unknown[],
    opts?: FormatEncodeDocumentOptions,
  ): Promise<string> => {
    const result = await client.callJson<{ result?: string }>(
      (lib) =>
        lib.call("formatEncodeDocument", {
          format,
          items,
          pretty: opts?.pretty ?? false,
          indent: opts?.indent ?? 0,
        }),
      errorsFor(errors.FORMAT_ENCODE_FAILED),
    );

    return result.result ?? "";
  },

  decode: async (format: string, text: string): Promise<unknown[]> => {
    const result = await client.callJson(
      (lib) => lib.call("formatDecode", { format, text }),
      errorsFor(errors.FORMAT_DECODE_FAILED),
    );

    return [...(result.items ?? [])];
  },

  list: async (): Promise<FormatListItem[]> => {
    const result = await client.callJson(
      (lib) => lib.call("formatList"),
      errorsFor(errors.FORMAT_LIST_FAILED),
    );

    return (result.formats ?? []).map((item): FormatListItem => ({
      ...item,
      extensions: [...item.extensions],
    }));
  },
};
