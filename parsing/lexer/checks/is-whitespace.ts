// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import { type PatternFunction } from "../tokens/definition.ts";

export const isWhitespace: PatternFunction = (input) => {
  // return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

  const match = /^\s+/.exec(input);

  if (match !== null) {
    return [match[0], match[0].length, false];
  }

  return [null, 0, false];
};
