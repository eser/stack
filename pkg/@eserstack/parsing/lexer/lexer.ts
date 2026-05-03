// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import {
  type PatternFunction,
  type TokenDefinitions,
} from "./tokens/definition.ts";
import { getLib } from "../ffi-client.ts";

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

/**
 * Returns serializable string-only definitions, or undefined when any pattern
 * is a function (callers should then let Go use its built-in simple-token set).
 */
const toStringDefinitions = (
  tokenDefs: TokenDefinitions,
): Array<{ name: string; pattern: string }> | undefined => {
  const hasFunctions = Object.values(tokenDefs).some(
    (p) => typeof p === "function",
  );
  if (hasFunctions) {
    return undefined;
  }
  return Object.entries(tokenDefs)
    .filter(([, p]) => p !== null)
    .map(([name, pattern]) => ({ name, pattern: pattern as string }));
};

export class Tokenizer {
  readonly state: TokenizerState;

  constructor(state: TokenizerState) {
    this.state = state;
  }

  *tokenizeFromString(input: string): Generator<Token> {
    this._reset();

    const lib = getLib();
    if (lib !== null) {
      // Definitions: undefined → Go uses its built-in simple tokens (matches
      // the TS simpleTokens set which has function-based patterns).
      const definitions = toStringDefinitions(this.state.tokenDefs);
      const req: Record<string, unknown> = { input };
      if (definitions !== undefined) req["definitions"] = definitions;

      const raw = lib.symbols.EserAjanParsingTokenize(JSON.stringify(req));
      const result = JSON.parse(raw) as {
        tokens: Array<{ kind: string; value: string }>;
        error?: string;
      };

      if (!result.error) {
        for (const tok of result.tokens) {
          yield { kind: tok.kind, value: tok.value };
        }
        return;
      }
    }

    // Fallback: TS tokenizer
    yield* this._tokenizeChunk(input);
    yield* this._tokenizeChunk(null);
  }

  async *tokenize(input: ReadableStream): AsyncGenerator<Token> {
    this._reset();

    const lib = getLib();
    if (lib !== null) {
      // Accumulate all chunks, then tokenize in one Go call
      const chunks: string[] = [];
      for await (const chunk of input) {
        chunks.push(chunk as string);
      }
      const fullInput = chunks.join("");
      const definitions = toStringDefinitions(this.state.tokenDefs);
      const req: Record<string, unknown> = { input: fullInput };
      if (definitions !== undefined) req["definitions"] = definitions;

      const raw = lib.symbols.EserAjanParsingTokenize(JSON.stringify(req));
      const result = JSON.parse(raw) as {
        tokens: Array<{ kind: string; value: string }>;
        error?: string;
      };

      if (!result.error) {
        for (const tok of result.tokens) {
          yield { kind: tok.kind, value: tok.value };
        }
        return;
      }
    }

    // Fallback: TS chunk-by-chunk tokenizer
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
