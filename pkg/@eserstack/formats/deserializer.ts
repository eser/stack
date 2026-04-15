// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions } from "./types.ts";
import { FormatNotFoundError } from "./types.ts";
import { getFormat } from "./format-registry.ts";

export const deserialize = (
  input: string,
  format: string,
  options?: FormatOptions,
): unknown[] => {
  const formatAdapter = getFormat(format);
  if (formatAdapter === undefined) {
    throw new FormatNotFoundError(format);
  }

  const reader = formatAdapter.createReader(options);
  const items = reader.push(input);
  const remaining = reader.flush();

  return [...items, ...remaining];
};
