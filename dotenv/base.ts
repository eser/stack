// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

// public symbols
export const env = Symbol("env");

// public constants
export const defaultEnvVar = "ENV";
export const defaultEnvValue = "development";

// public types
export type EnvMap = Map<typeof env | string, string>;
