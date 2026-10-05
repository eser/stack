// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * What a pattern function found at the start of its input: the matched text
 * (or `null` for no match), the number of characters it used, and whether the
 * match could grow if more input arrived.
 */
export type PatternFunctionResult = [string | null, number, boolean];

/** Matches a token at the start of `input`. */
export type PatternFunction = (input: string) => PatternFunctionResult;

/**
 * Token kinds by name, each with a literal string or a pattern function that
 * matches it. `T_UNKNOWN` and `T_END` are set to `null`: the tokenizer emits
 * them itself for an unmatched character and for the end of the input.
 */
export type TokenDefinitions = {
  T_UNKNOWN: null;
  T_END: null;
  [key: string]: string | PatternFunction | null;
};
