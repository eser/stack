// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type Token } from "./lexer/lexer.ts";

export interface ASTNode {
  kind: string;
  [key: string]: unknown;
}

export type Parser = (t: Iterator<Token>) => Array<ASTNode> | null;

export const token = (input: string): Parser => {
  return (t: Iterator<Token>) => {
    const { value, done } = t.next();

    if (done || value.kind !== input) {
      return null;
    }

    return [
      {
        kind: "token",
        token: value,
      },
    ];
  };
};

export const sequence = (...parsers: ReadonlyArray<Parser>): Parser => {
  return (t: Iterator<Token>) => {
    const results = [];

    for (const parser of parsers) {
      const result = parser(t);

      if (result === null) {
        return null;
      }

      results.push(...result);
    }

    return results;
  };
};
