// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from preact (https://github.com/preactjs/preact),
// which is a React alternative, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2015-present Jason Miller

const ENCODED_ENTITIES = /["&<]/;

export const encodeEntities = (str: string) => {
  // Skip all work for strings with no entities needing encoding:
  if (str.length === 0 || ENCODED_ENTITIES.test(str) === false) {
    return str;
  }

  let last = 0,
    i = 0,
    out = "",
    ch = "";

  // Seek forward in str until the next entity char:
  for (; i < str.length; i++) {
    switch (str.charCodeAt(i)) {
      case 34:
        ch = "&quot;";
        break;
      case 38:
        ch = "&amp;";
        break;
      case 60:
        ch = "&lt;";
        break;
      default:
        continue;
    }

    // Append skipped/buffered characters and the encoded entity:
    if (i !== last) {
      out += str.slice(last, i);
    }

    out += ch;

    // Start the next seek/buffer after the entity's offset:
    last = i + 1;
  }

  if (i !== last) {
    out += str.slice(last, i);
  }

  return out;
};
