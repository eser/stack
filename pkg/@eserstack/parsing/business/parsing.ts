// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** A token returned by the Go tokenizer, with its position in the input. */
export type FfiToken = {
  readonly kind: string;
  readonly value: string;
  readonly offset: number;
  readonly length: number;
};

/** A token kind for the Go tokenizer and the regular expression it matches. */
export type FfiTokenDefinition = {
  readonly name: string;
  readonly pattern: string;
};

/**
 * Input for the Go tokenizer. Without `definitions` it uses its built-in
 * simple tokens.
 */
export type TokenizeInput = {
  readonly input: string;
  readonly definitions?: FfiTokenDefinition[];
};

/** The built-in simple token definitions of the Go tokenizer. */
export type SimpleTokensResult = {
  readonly definitions: FfiTokenDefinition[];
};

/** Runs the Go tokenizer. */
export type Loader = {
  tokenize(input: TokenizeInput): Promise<FfiToken[]>;
  simpleTokens(): Promise<SimpleTokensResult>;
};

/**
 * Tokenizes input with the given loader.
 *
 * @param loader - The loader that runs the tokenizer
 * @param input - The text and optional token definitions
 * @returns The tokens in order
 */
export const tokenizeWith = (
  loader: Loader,
  input: TokenizeInput,
): Promise<FfiToken[]> => loader.tokenize(input);

/**
 * Reads the built-in simple token definitions through the given loader.
 *
 * @param loader - The loader that runs the tokenizer
 * @returns The definitions
 */
export const simpleTokensWith = (loader: Loader): Promise<SimpleTokensResult> =>
  loader.simpleTokens();
