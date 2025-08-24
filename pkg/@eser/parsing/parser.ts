// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type Token } from "./lexer/lexer.ts";

export type ASTNode = {
  kind: string;
  [key: string]: unknown;
};

export type Parser = (t: Iterator<Token>) => Array<ASTNode> | null;

/**
 * Create a parser that matches a specific token kind.
 *
 * @param input The token kind to match
 * @returns A parser function that matches the specified token kind
 * @throws {Error} If input is not a valid string
 */
export const token = (input: string): Parser => {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("Token input must be a non-empty string");
  }

  return (t: Iterator<Token>) => {
    if (!t || typeof t.next !== "function") {
      throw new Error("Token iterator must be a valid Iterator");
    }

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

/**
 * Create a parser that applies a sequence of parsers in order.
 *
 * @param parsers Array of parsers to apply in sequence
 * @returns A parser that succeeds only if all parsers in the sequence succeed
 * @throws {Error} If parsers array is empty or contains invalid parsers
 */
export const sequence = (...parsers: ReadonlyArray<Parser>): Parser => {
  if (parsers.length === 0) {
    throw new Error("Sequence must contain at least one parser");
  }

  for (let i = 0; i < parsers.length; i++) {
    if (typeof parsers[i] !== "function") {
      throw new Error(`Parser at index ${i} must be a function`);
    }
  }

  return (t: Iterator<Token>) => {
    if (!t || typeof t.next !== "function") {
      throw new Error("Token iterator must be a valid Iterator");
    }

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
