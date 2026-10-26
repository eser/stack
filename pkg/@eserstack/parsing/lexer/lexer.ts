// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { PatternFunction, TokenDefinitions } from "./tokens/definition.ts";

/** One token: its kind, such as `T_COMMA`, and the text it matched. */
export type Token = {
  kind: string;
  value: string | undefined;
};

/**
 * The state of a `Tokenizer`: its token definitions, whether the input has
 * ended, and the text not yet turned into tokens.
 */
export type TokenizerState = {
  readonly tokenDefs: TokenDefinitions;
  isDone: boolean;
  buffer: string;
};

/**
 * Creates the state for a `Tokenizer` that uses the given definitions.
 *
 * @param tokenDefs - Token kinds and the patterns that match them
 * @returns A state with an empty buffer
 */
export const createTokenizerState = (
  tokenDefs: TokenDefinitions,
): TokenizerState => {
  return {
    tokenDefs,
    isDone: true,
    buffer: "",
  };
};

/**
 * Turns text into tokens. A string pattern matches literally, a pattern
 * function decides itself, and the first definition that matches wins. A
 * character no definition matches becomes a `T_UNKNOWN` token, and the last
 * token is `T_END`.
 *
 * This tokenizer always runs in TypeScript. For the regular-expression
 * tokenizer of the Go library, use `tokenizeWith(ffiLoader, ...)`, whose token
 * kinds and pattern syntax differ.
 *
 * @example
 * ```typescript
 * import * as parsing from "@eserstack/parsing";
 *
 * const lexer = new parsing.Tokenizer(
 *   parsing.createTokenizerState(parsing.simpleTokens),
 * );
 *
 * const kinds = [...lexer.tokenizeFromString("1 + 2")].map((t) => t.kind);
 * ```
 */
export class Tokenizer {
  /** Definitions, end flag and pending text; the tokenizer updates it. */
  readonly state: TokenizerState;

  /**
   * Creates a tokenizer.
   *
   * @param state - From `createTokenizerState()`
   */
  constructor(state: TokenizerState) {
    this.state = state;
  }

  /**
   * Tokenizes a whole string.
   *
   * @param input - The text to tokenize
   * @returns The tokens in order, ending with `T_END`
   */
  *tokenizeFromString(input: string): Generator<Token> {
    this._reset();

    yield* this._tokenizeChunk(input);
    yield* this._tokenizeChunk(null);
  }

  /**
   * Tokenizes text read from a stream of string chunks. A token that a
   * pattern function matches may span chunks; a string pattern must fall
   * within one chunk.
   *
   * @param input - A stream of string chunks
   * @returns The tokens in order, ending with `T_END`
   */
  async *tokenize(input: ReadableStream): AsyncGenerator<Token> {
    this._reset();

    for await (const chunk of input) {
      yield* this._tokenizeChunk(chunk);
    }
    yield* this._tokenizeChunk(null);
  }

  /**
   * Tokenizes one chunk in TypeScript and keeps a partial token for the next
   * chunk. Pass `null` to end the input. `tokenize()` and
   * `tokenizeFromString()` call it; call it directly only to drive the
   * tokenizer chunk by chunk.
   *
   * @param input - The next chunk, or `null` at the end of the input
   * @returns The tokens completed by this chunk
   */
  *_tokenizeChunk(input: string | null): Generator<Token> {
    if (input === null) {
      this.state.isDone = true;
    } else {
      this.state.buffer += input;
    }

    let position = 0;

    while (position < this.state.buffer.length) {
      let matched = false;

      for (const [tokenKind, pattern] of Object.entries(this.state.tokenDefs)) {
        if (pattern === null) {
          continue;
        }

        if (pattern.constructor === String) {
          if (
            pattern !== "" &&
            this.state.buffer.startsWith(pattern as string, position)
          ) {
            yield { kind: tokenKind, value: pattern } as Token;

            position += pattern.length;
            matched = true;

            break;
          }

          continue;
        }

        if (pattern.constructor === Function) {
          const remainingStr = this.state.buffer.substring(position);
          const [value, length, couldContinue] = (pattern as PatternFunction)(
            remainingStr,
          );

          if (couldContinue && !this.state.isDone) {
            this.state.buffer = remainingStr;
            return;
          }

          if (value !== null) {
            yield { kind: tokenKind, value } as Token;

            position += length;
            matched = true;

            break;
          }
        }
      }

      if (!matched) {
        yield {
          kind: "T_UNKNOWN",
          value: this.state.buffer[position],
        };

        position++;
      }
    }

    if (this.state.buffer.length > 0) {
      this.state.buffer = this.state.buffer.substring(position);
    }

    if (this.state.isDone) {
      if (this.state.buffer.length > 0) {
        return;
      }

      yield { kind: "T_END", value: "" } as Token;
    }
  }

  /** Clears the buffer and the end flag before a new input. */
  _reset(): void {
    this.state.isDone = false;
    this.state.buffer = "";
  }
}
