// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions } from "./types.ts";
import { FormatNotFoundError } from "./types.ts";
import { getFormat } from "./format-registry.ts";
import { ensureLib, getLib } from "./ffi-client.ts";

export const deserialize = async (
  input: string,
  format: string,
  options?: FormatOptions,
): Promise<unknown[]> => {
  await ensureLib();

  const lib = getLib();
  if (lib !== null) {
    try {
      const requestJSON = JSON.stringify({ format, text: input, headers: options?.headers });
      const raw = lib.symbols.EserAjanFormatDecode(requestJSON);
      const parsed = JSON.parse(raw) as {
        items?: unknown[];
        error?: string;
      };
      if (!parsed.error) {
        return parsed.items ?? [];
      }
      // Non-fatal: fall through to TS fallback (e.g. format only registered in TS)
    } catch {
      // Fall through to TS fallback
    }
  }

  // TS fallback: pure TypeScript implementation.
  const formatAdapter = getFormat(format);
  if (formatAdapter === undefined) {
    throw new FormatNotFoundError(format);
  }

  const reader = formatAdapter.createReader(options);
  const items = reader.push(input);
  const remaining = reader.flush();

  return [...items, ...remaining];
};
