// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { WriteOptions } from "./types.ts";
import { FormatNotFoundError } from "./types.ts";
import { getFormat } from "./format-registry.ts";

export const write = (
  data: unknown,
  format: string,
  options?: WriteOptions,
): string => {
  const finalOptions: WriteOptions = options ?? {};

  const formatAdapter = getFormat(format);
  if (formatAdapter === undefined) {
    throw new FormatNotFoundError(format);
  }

  return formatAdapter.serialize(data, finalOptions);
};
