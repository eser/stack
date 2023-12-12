// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import { type PatternFunction } from "../tokens/definition.ts";

export const isAlphanumeric: PatternFunction = (input) => {
  // const match = /^[\p{L}\p{N}_]+/u.test(input);
  const match =
    /^[\p{L}\p{N}_\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\p{Extended_Pictographic}]+/u
      .exec(input);

  if (match !== null) {
    return [match[0], match[0].length, true];
  }

  return [null, 0, false];
};
