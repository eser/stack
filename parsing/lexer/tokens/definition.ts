// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type PatternFunctionResult = [string | null, number, boolean];
export type PatternFunction = (input: string) => PatternFunctionResult;

export interface TokenDefinitions {
  T_UNKNOWN: null;
  T_END: null;
  [key: string]: string | PatternFunction | null;
}
