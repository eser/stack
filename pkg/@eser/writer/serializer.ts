// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { WriteOptions } from "./types.ts";
import { FormatNotFoundError } from "./types.ts";
import { getFormat } from "./format-registry.ts";

// Trim trailing separator from output (for YAML/TOML multi-doc)
const trimTrailingSeparator = (output: string): string => {
  return output.replace(/\n(---|\+\+\+)\n$/, "\n");
};

export const serialize = (
  data: unknown,
  format: string,
  options?: WriteOptions,
): string => {
  const formatAdapter = getFormat(format);
  if (formatAdapter === undefined) {
    throw new FormatNotFoundError(format);
  }

  const chunks: string[] = [];

  // Start document
  const startOutput = formatAdapter.writeStart?.(options) ?? "";
  if (startOutput) chunks.push(startOutput);

  // Handle arrays: iterate with writeItem
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const itemOptions: WriteOptions = {
        ...options,
        _isFirst: i === 0,
        _inArray: true, // signal array mode for JSON
      };
      chunks.push(formatAdapter.writeItem(data[i], itemOptions));
    }
  } else {
    // Single item: mark as first
    const finalOptions: WriteOptions = {
      ...options,
      _isFirst: true,
      _inArray: true, // still use array mode for consistency with start/end
    };
    chunks.push(formatAdapter.writeItem(data, finalOptions));
  }

  // End document
  const endOutput = formatAdapter.writeEnd?.(options) ?? "";
  if (endOutput) chunks.push(endOutput);

  return trimTrailingSeparator(chunks.join(""));
};
