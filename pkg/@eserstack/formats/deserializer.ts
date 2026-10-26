// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions } from "./types.ts";
import * as types from "./types.ts";
import * as formatRegistry from "./format-registry.ts";
import * as ffiClient from "./ffi-client.ts";

export const deserialize = async (
  input: string,
  format: string,
  options?: FormatOptions,
): Promise<unknown[]> => {
  await ffiClient.ensureLib();

  const lib = ffiClient.getLib();
  if (lib !== null) {
    try {
      const parsed = lib.call("formatDecode", {
        format,
        text: input,
        headers: options?.headers,
      });
      if (!parsed.error) {
        return [...(parsed.items ?? [])];
      }
      // Non-fatal: fall through to TS fallback (e.g. format only registered in TS)
    } catch {
      // Fall through to TS fallback
    }
  }

  // TS fallback: pure TypeScript implementation.
  const formatAdapter = formatRegistry.getFormat(format);
  if (formatAdapter === undefined) {
    throw new types.FormatNotFoundError(format);
  }

  const reader = formatAdapter.createReader(options);
  const items = reader.push(input);
  const remaining = reader.flush();

  return [...items, ...remaining];
};
