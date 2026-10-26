// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Token } from "./lexer/lexer.ts";

/** A node of the syntax tree: its kind and any fields the parser adds. */
export type ASTNode = {
  kind: string;
  [key: string]: unknown;
};

/**
 * Reads tokens from an iterator and returns the nodes it parsed, or `null`
 * when the tokens do not match.
 */
export type Parser = (t: Iterator<Token>) => Array<ASTNode> | null;

/**
 * Creates a parser that matches one token of the given kind and returns it as
 * a `token` node.
 *
 * @param input - The token kind to match, such as `T_COMMA`
 * @returns The parser
 */
export const token = (input: string): Parser => {
  return (t: Iterator<Token>) => {
    const { value, done } = t.next();

    if (done === true || value.kind !== input) {
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
 * Creates a parser that runs the given parsers in order and returns all their
 * nodes, or `null` as soon as one of them does not match.
 *
 * @param parsers - The parsers to run, in order
 * @returns The parser
 */
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
