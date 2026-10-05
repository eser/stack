// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** The key under which an `EnvMap` holds the environment name. */
export const env: unique symbol = Symbol("env");

/** The variables read for the environment name, in order. */
export const envVars: string[] = ["ENV", "APP_ENV", "DENO_ENV", "NODE_ENV"];

/** The environment name used when none of `envVars` is set. */
export const defaultEnvValue = "development";

/**
 * Loaded variables by name, plus the environment name under the `env`
 * symbol.
 */
export type EnvMap = Map<typeof env | string, string>;
