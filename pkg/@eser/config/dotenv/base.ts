// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// public symbols
export const env = Symbol("env");

// public constants
export const envVars = ["ENV", "APP_ENV", "DENO_ENV", "NODE_ENV"];
export const defaultEnvValue = "development";

// public types
export type EnvMap = Map<typeof env | string, string>;
