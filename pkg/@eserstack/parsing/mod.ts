// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A tokenizer that turns text into tokens from a dictionary of literal strings
 * and pattern functions, and parser combinators that build an abstract syntax
 * tree from the tokens.
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
 *
 * @module
 */

export {
  createTokenizerState,
  type PatternFunction,
  type PatternFunctionResult,
  simpleTokens,
  type Token,
  type TokenDefinitions,
  Tokenizer,
  type TokenizerState,
} from "./lexer/mod.ts";
export { type ASTNode, type Parser, sequence, token } from "./parser.ts";

// FFI layer
export {
  type FfiToken,
  type FfiTokenDefinition,
  type Loader,
  PARSING_INVALID_PATTERN,
  PARSING_TOKENIZE_FAILED,
  ParsingError,
  type SimpleTokensResult,
  simpleTokensWith,
  type TokenizeInput,
  tokenizeWith,
} from "./business/mod.ts";
export { ffiLoader } from "./adapters/ffi/mod.ts";
