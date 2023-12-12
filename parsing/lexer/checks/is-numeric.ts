// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import { type PatternFunction } from "../tokens/definition.ts";

export const isNumeric: PatternFunction = (input) => {
  // const code = ch.charCodeAt(0);
  // return code >= 48 && code <= 57;

  const match = /^[0-9]+/.exec(input);

  if (match !== null) {
    return [match[0], match[0].length, false];
  }

  return [null, 0, false];
};
