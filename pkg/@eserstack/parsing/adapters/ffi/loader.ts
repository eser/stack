// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as client from "@eserstack/ajan/ffi/client";
import type {
  FfiToken,
  Loader,
  SimpleTokensResult,
  TokenizeInput,
} from "../../business/parsing.ts";
import * as errors from "../../business/errors.ts";

const mapErrorCode = (msg: string): string => {
  if (msg.includes("invalid pattern") || msg.includes("error parsing regexp")) {
    return errors.PARSING_INVALID_PATTERN;
  }
  return errors.PARSING_TOKENIZE_FAILED;
};

// Arrow properties rather than method shorthand: deno lint's
// no-top-level-await reports an await inside an object method as top level.
/**
 * A `Loader` that runs the Go tokenizer. It throws a `ParsingError` with
 * `PARSING_TOKENIZE_FAILED` when the library is not available.
 */
export const ffiLoader: Loader = {
  tokenize: async (input: TokenizeInput): Promise<FfiToken[]> => {
    const req: Record<string, unknown> = { input: input.input };
    if (input.definitions !== undefined && input.definitions.length > 0) {
      req["definitions"] = input.definitions;
    }

    const result = await client.callJson<{ tokens?: FfiToken[] }>(
      (lib) => lib.symbols.EserAjanParsingTokenize(JSON.stringify(req)),
      {
        onUnavailable: () =>
          new errors.ParsingError(
            "native library unavailable",
            errors.PARSING_TOKENIZE_FAILED,
          ),
        onError: (msg) => new errors.ParsingError(msg, mapErrorCode(msg)),
      },
    );

    return result.tokens ?? [];
  },

  simpleTokens: async (): Promise<SimpleTokensResult> => {
    const result = await client.callJson<
      { definitions?: { name: string; pattern: string }[] }
    >(
      (lib) => lib.symbols.EserAjanParsingSimpleTokens(),
      {
        onUnavailable: () =>
          new errors.ParsingError(
            "native library unavailable",
            errors.PARSING_TOKENIZE_FAILED,
          ),
        onError: (msg) =>
          new errors.ParsingError(msg, errors.PARSING_TOKENIZE_FAILED),
      },
    );

    return { definitions: result.definitions ?? [] };
  },
};
