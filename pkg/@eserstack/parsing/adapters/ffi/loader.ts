// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ffi from "@eserstack/ajan/ffi";
import type { FfiToken, Loader, SimpleTokensResult, TokenizeInput } from "../../business/parsing.ts";
import {
  PARSING_INVALID_PATTERN,
  PARSING_TOKENIZE_FAILED,
  ParsingError,
} from "../../business/errors.ts";

let _lib: ffi.FFILibrary | null = null;
let _libPromise: Promise<void> | null = null;

const ensureLib = (): Promise<void> => {
  if (_libPromise === null) {
    _libPromise = ffi
      .loadEserAjan()
      .then((lib) => {
        _lib = lib;
      })
      .catch(() => {});
  }
  return _libPromise;
};

const getLib = (): ffi.FFILibrary | null => _lib;

const mapErrorCode = (msg: string): string => {
  if (msg.includes("invalid pattern") || msg.includes("error parsing regexp")) {
    return PARSING_INVALID_PATTERN;
  }
  return PARSING_TOKENIZE_FAILED;
};

export const ffiLoader: Loader = {
  async tokenize(input: TokenizeInput): Promise<FfiToken[]> {
    await ensureLib();
    const lib = getLib();
    if (lib === null) {
      throw new ParsingError("native library unavailable", PARSING_TOKENIZE_FAILED);
    }

    const req: Record<string, unknown> = { input: input.input };
    if (input.definitions !== undefined && input.definitions.length > 0) {
      req["definitions"] = input.definitions;
    }

    const raw = lib.symbols.EserAjanParsingTokenize(JSON.stringify(req));
    const result = JSON.parse(raw) as { tokens?: FfiToken[]; error?: string };
    if (result.error) {
      throw new ParsingError(result.error, mapErrorCode(result.error));
    }
    return result.tokens ?? [];
  },

  async simpleTokens(): Promise<SimpleTokensResult> {
    await ensureLib();
    const lib = getLib();
    if (lib === null) {
      throw new ParsingError("native library unavailable", PARSING_TOKENIZE_FAILED);
    }

    const raw = lib.symbols.EserAjanParsingSimpleTokens();
    const result = JSON.parse(raw) as {
      definitions?: { name: string; pattern: string }[];
      error?: string;
    };
    if (result.error) {
      throw new ParsingError(result.error, PARSING_TOKENIZE_FAILED);
    }
    return { definitions: result.definitions ?? [] };
  },
};
