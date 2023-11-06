// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export type PatternFunctionResult = [string | null, number, boolean];
export type PatternFunction = (input: string) => PatternFunctionResult;

export interface TokenDefinitions {
  T_UNKNOWN: null;
  T_END: null;
  [key: string]: string | PatternFunction | null;
}
