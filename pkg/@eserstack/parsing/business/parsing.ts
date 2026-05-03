// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type FfiToken = {
  readonly kind: string;
  readonly value: string;
  readonly offset: number;
  readonly length: number;
};

export type FfiTokenDefinition = {
  readonly name: string;
  readonly pattern: string;
};

export type TokenizeInput = {
  readonly input: string;
  readonly definitions?: FfiTokenDefinition[];
};

export type SimpleTokensResult = {
  readonly definitions: FfiTokenDefinition[];
};

export type Loader = {
  tokenize(input: TokenizeInput): Promise<FfiToken[]>;
  simpleTokens(): Promise<SimpleTokensResult>;
};

export const tokenizeWith = (
  loader: Loader,
  input: TokenizeInput,
): Promise<FfiToken[]> => loader.tokenize(input);

export const simpleTokensWith = (
  loader: Loader,
): Promise<SimpleTokensResult> => loader.simpleTokens();
