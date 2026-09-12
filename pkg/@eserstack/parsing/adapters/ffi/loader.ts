// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { callJson } from "@eserstack/ajan/ffi/client";
import type {
  FfiToken,
  Loader,
  SimpleTokensResult,
  TokenizeInput,
} from "../../business/parsing.ts";
import {
  PARSING_INVALID_PATTERN,
  PARSING_TOKENIZE_FAILED,
  ParsingError,
} from "../../business/errors.ts";

const mapErrorCode = (msg: string): string => {
  if (msg.includes("invalid pattern") || msg.includes("error parsing regexp")) {
    return PARSING_INVALID_PATTERN;
  }
  return PARSING_TOKENIZE_FAILED;
};

export const ffiLoader: Loader = {
  async tokenize(input: TokenizeInput): Promise<FfiToken[]> {
    const req: Record<string, unknown> = { input: input.input };
    if (input.definitions !== undefined && input.definitions.length > 0) {
      req["definitions"] = input.definitions;
    }

    const result = await callJson<{ tokens?: FfiToken[] }>(
      (lib) => lib.symbols.EserAjanParsingTokenize(JSON.stringify(req)),
      {
        onUnavailable: () =>
          new ParsingError(
            "native library unavailable",
            PARSING_TOKENIZE_FAILED,
          ),
        onError: (msg) => new ParsingError(msg, mapErrorCode(msg)),
      },
    );

    return result.tokens ?? [];
  },

  async simpleTokens(): Promise<SimpleTokensResult> {
    const result = await callJson<
      { definitions?: { name: string; pattern: string }[] }
    >(
      (lib) => lib.symbols.EserAjanParsingSimpleTokens(),
      {
        onUnavailable: () =>
          new ParsingError(
            "native library unavailable",
            PARSING_TOKENIZE_FAILED,
          ),
        onError: (msg) => new ParsingError(msg, PARSING_TOKENIZE_FAILED),
      },
    );

    return { definitions: result.definitions ?? [] };
  },
};
