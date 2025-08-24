// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import {
  type PatternFunction,
  type TokenDefinitions,
} from "./tokens/definition.ts";

export type Token = {
  kind: string;
  value: string | undefined;
};

export type TokenizerState = {
  readonly tokenDefs: TokenDefinitions;
  isDone: boolean;
  buffer: string;
};

export const createTokenizerState = (
  tokenDefs: TokenDefinitions,
): TokenizerState => {
  return {
    tokenDefs,
    isDone: true,
    buffer: "",
  };
};

export class Tokenizer {
  readonly state: TokenizerState;

  constructor(state: TokenizerState) {
    this.state = state;
  }

  /**
   * Sanitize input string to prevent potential security issues.
   */
  private _sanitizeInput(input: string): string {
    if (typeof input !== "string") {
      throw new Error("Input must be a string");
    }

    // Limit input size to prevent DoS attacks
    const MAX_INPUT_SIZE = 1024 * 1024; // 1MB
    if (input.length > MAX_INPUT_SIZE) {
      throw new Error(
        `Input size exceeds maximum allowed size of ${MAX_INPUT_SIZE} characters`,
      );
    }

    // Remove or replace potentially dangerous characters
    // This is a basic sanitization - adjust based on your specific needs
    return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  }

  *tokenizeFromString(input: string): Generator<Token> {
    const sanitizedInput = this._sanitizeInput(input);
    this._reset();

    yield* this._tokenizeChunk(sanitizedInput);
    yield* this._tokenizeChunk(null);
  }

  async *tokenize(input: ReadableStream): AsyncGenerator<Token> {
    this._reset();

    for await (const chunk of input) {
      yield* this._tokenizeChunk(chunk);
    }
    yield* this._tokenizeChunk(null);
  }

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

  _reset() {
    this.state.isDone = false;
    this.state.buffer = "";
  }
}
