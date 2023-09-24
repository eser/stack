import {
  type PatternFunction,
  type TokenDefinitions,
} from "./tokens/definition.ts";

export class Tokenizer {
  readonly tokenDefs: TokenDefinitions;
  _isDone = true;
  _buffer = "";

  constructor(tokenDefs: TokenDefinitions) {
    this.tokenDefs = tokenDefs;
  }

  *tokenizeFromString(input: string) {
    this._reset();

    yield* this._tokenizeChunk(input);
    yield* this._tokenizeChunk(null);
  }

  async *tokenize(input: ReadableStream) {
    this._reset();

    for await (const chunk of input) {
      yield* this._tokenizeChunk(chunk);
    }
    yield* this._tokenizeChunk(null);
  }

  *_tokenizeChunk(input: string | null) {
    if (input === null) {
      this._isDone = true;
    } else {
      this._buffer += input;
    }

    let position = 0;

    while (position < this._buffer.length) {
      let matched = false;

      for (const [tokenKind, [, pattern]] of Object.entries(this.tokenDefs)) {
        if (pattern.constructor === String) {
          if (
            pattern !== "" &&
            this._buffer.startsWith(pattern as string, position)
          ) {
            yield { kind: tokenKind, value: pattern };

            position += pattern.length;
            matched = true;

            break;
          }

          continue;
        }

        if (pattern.constructor === Function) {
          const remainingStr = this._buffer.substring(position);
          const [value, length, couldContinue] = (pattern as PatternFunction)(
            remainingStr,
          );

          if (couldContinue && !this._isDone) {
            this._buffer = remainingStr;
            return;
          }

          if (value !== null) {
            yield { kind: tokenKind, value };

            position += length;
            matched = true;

            break;
          }
        }
      }

      if (!matched) {
        yield {
          kind: this.tokenDefs.T_UNKNOWN[0],
          value: this._buffer[position],
        };

        position++;
      }
    }

    if (this._buffer.length > 0) {
      this._buffer = this._buffer.substring(position);
    }

    if (this._isDone) {
      if (this._buffer.length > 0) {
        return;
      }

      yield { kind: this.tokenDefs.T_END[0], value: "" };
    }
  }

  _reset() {
    this._isDone = false;
    this._buffer = "";
  }
}
