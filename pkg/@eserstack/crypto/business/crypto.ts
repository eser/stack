// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type HashInput = {
  readonly text?: string;
  readonly data?: Uint8Array;
};

export type HashOptions = {
  readonly algorithm?: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
  readonly length?: number;
};

export type Loader = {
  hash(input: HashInput, opts?: HashOptions): Promise<string>;
};

export const hashWith = (
  loader: Loader,
  input: HashInput,
  opts?: HashOptions,
): Promise<string> => loader.hash(input, opts);
