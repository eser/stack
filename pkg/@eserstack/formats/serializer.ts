// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { WriteOptions } from "./types.ts";
import { FormatNotFoundError } from "./types.ts";
import { getFormat } from "./format-registry.ts";
import { ensureLib, getLib } from "./ffi-client.ts";

// Trim trailing separator from output (for YAML/TOML multi-doc)
const trimTrailingSeparator = (output: string): string => {
  return output.replace(/\n(---|\+\+\+)\n$/, "\n");
};

export const serialize = async (
  data: unknown,
  format: string,
  options?: WriteOptions,
): Promise<string> => {
  await ensureLib();

  // FFI path: delegate full document assembly to Go (WriteStart + WriteItem×N + WriteEnd).
  const lib = getLib();
  if (lib !== null) {
    try {
      const items = Array.isArray(data) ? data : [data];
      const requestJSON = JSON.stringify({
        format,
        items,
        pretty: options?.pretty ?? false,
        indent: options?.indent ?? 0,
      });
      const raw = lib.symbols.EserAjanFormatEncodeDocument(requestJSON);
      const parsed = JSON.parse(raw) as { result?: string; error?: string };
      if (!parsed.error) {
        return parsed.result ?? "";
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

  const chunks: string[] = [];

  const startOutput = formatAdapter.writeStart?.(options) ?? "";
  if (startOutput) chunks.push(startOutput);

  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const itemOptions: WriteOptions = {
        ...options,
        _isFirst: i === 0,
        _inArray: true,
      };
      chunks.push(formatAdapter.writeItem(data[i], itemOptions));
    }
  } else {
    const finalOptions: WriteOptions = {
      ...options,
      _isFirst: true,
      _inArray: true,
    };
    chunks.push(formatAdapter.writeItem(data, finalOptions));
  }

  const endOutput = formatAdapter.writeEnd?.(options) ?? "";
  if (endOutput) chunks.push(endOutput);

  return trimTrailingSeparator(chunks.join(""));
};
