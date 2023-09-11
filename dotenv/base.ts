// public symbols
export const env = Symbol("env");

// public constants
export const defaultEnvVar = "ENV";
export const defaultEnvValue = "development";

// public types
export type EnvMap = Map<typeof env | string, string>;
