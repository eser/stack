export type PatternFunctionResult = [string | null, number, boolean];
export type PatternFunction = (input: string) => PatternFunctionResult;

export interface TokenDefinitions {
  T_UNKNOWN: ["T_UNKNOWN", string];
  T_END: ["T_END", string];
  [key: string]: [string, string | PatternFunction];
}
