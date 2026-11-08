// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The bridge calls behind `@eserstack/config/dotenv`. Go owns the `.env`
 * dialect and the file loading (`pkg/ajan/configfx/envparser`); this module
 * sends the host's environment along, because the WASM build has none of its
 * own, and turns the answers into the values and errors the TypeScript API
 * has always returned. Not exported from the package.
 *
 * @module
 */

import * as client from "@eserstack/ajan/ffi/client";
import type * as bindings from "@eserstack/ajan/ffi/bindings";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

type DotenvAnswer = bindings.ConfigDotenvAnswer;

/** The `environ` and `envCaseInsensitive` fields of the dotenv requests. */
export const hostEnviron = (): bindings.ConfigEnvironRequest => ({
  environ: Object.entries(crossRuntime.runtime.env.toObject()),
  // Windows looks its variables up regardless of case.
  envCaseInsensitive: crossRuntime.getPlatform() === "windows",
});

/**
 * The limit a request carries: `null` for no limit, which JSON cannot spell
 * as Infinity. NaN never compares larger, so it sets no limit either.
 */
export const wireMaxFileSize = (maxFileSize: number): number | null => {
  if (Number.isNaN(maxFileSize) || maxFileSize === Infinity) {
    return null;
  }

  if (maxFileSize === -Infinity) {
    return -1;
  }

  return maxFileSize;
};

/**
 * Warns about the keys Go skipped, with the words @std/dotenv warned with.
 * The package has no logger.
 */
const warnIgnored = (ignored: readonly string[] | undefined): void => {
  for (const key of ignored ?? []) {
    // oxlint-disable-next-line no-console
    console.warn(
      `Ignored the key "${key}" as it is not a valid identifier: The key need to match the pattern /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
    );
  }
};

/** The entries as a null-prototype record, as the TypeScript parser built it. */
const toRecord = (entries: DotenvAnswer["entries"]): Record<string, string> => {
  const record: Record<string, string> = Object.create(null);
  for (const [key, value] of entries ?? []) {
    record[key] = value;
  }

  return record;
};

/** What the dotenv calls answer on failure, as the error to throw. */
export interface DotenvFailure {
  readonly message: string;
  readonly code: string;
  readonly fileSize: number;
}

const failureOf = (answer: DotenvAnswer): DotenvFailure | null => {
  if (answer.error === undefined || answer.error === "") {
    return null;
  }

  return {
    message: answer.error,
    code: answer.code ?? "",
    fileSize: answer.fileSize ?? 0,
  };
};

/**
 * Parses `.env` text in Go (`configParseDotenv`), synchronously. The bridge
 * loads on first use.
 *
 * @throws {Error} When the bridge is unavailable, with its load error as
 *   `cause`
 */
export const parseText = (text: string): Record<string, string> => {
  const answer = client
    .requireLibSync()
    .call("configParseDotenv", { text, ...hostEnviron() });

  const failure = failureOf(answer);
  if (failure !== null) {
    throw new Error(failure.message);
  }

  warnIgnored(answer.ignored);

  return toRecord(answer.entries);
};

/** The variables of one file, or why it could not be read. */
export type ReadResult =
  | { readonly ok: true; readonly values: Record<string, string> }
  | { readonly ok: false; readonly failure: DotenvFailure };

/**
 * Reads and parses one `.env` file in Go (`configReadDotenvFile`). A missing
 * file reads as empty.
 *
 * @throws {Error} When the bridge is unavailable, with its load error as
 *   `cause`
 */
export const readFile = async (
  path: string,
  maxFileSize: number,
): Promise<ReadResult> => {
  const lib = await client.requireLib();
  const answer = lib.call("configReadDotenvFile", {
    path,
    maxFileSize: wireMaxFileSize(maxFileSize),
    ...hostEnviron(),
  });

  warnIgnored(answer.ignored);

  const failure = failureOf(answer);
  if (failure !== null) {
    return { ok: false, failure };
  }

  return { ok: true, values: toRecord(answer.entries) };
};

/** The options of {@link loadFiles}, with every default applied. */
export interface LoadFilesOptions {
  readonly baseDir: string;
  readonly env: string | undefined;
  readonly envVars: readonly string[];
  readonly defaultEnvValue: string;
  readonly loadProcessEnv: boolean;
  readonly maxFileSize: number;
}

/** The loaded variables in load order, or the file that failed. */
export type LoadFilesResult =
  | {
      readonly ok: true;
      readonly envName: string;
      readonly entries: ReadonlyArray<readonly [string, string]>;
    }
  | {
      readonly ok: false;
      readonly filepath: string;
      readonly failure: DotenvFailure;
    };

/**
 * Loads the `.env` files of an environment and the process environment in Go
 * (`configLoadDotenv`).
 *
 * @throws {Error} When the bridge is unavailable, with its load error as
 *   `cause`
 */
export const loadFiles = async (
  options: LoadFilesOptions,
): Promise<LoadFilesResult> => {
  const lib = await client.requireLib();
  const answer = lib.call("configLoadDotenv", {
    baseDir: options.baseDir,
    env: options.env,
    envVars: options.envVars,
    defaultEnvValue: options.defaultEnvValue,
    loadProcessEnv: options.loadProcessEnv,
    maxFileSize: wireMaxFileSize(options.maxFileSize),
    ...hostEnviron(),
  });

  warnIgnored(answer.ignored);

  const failure = failureOf(answer);
  if (failure !== null) {
    return { ok: false, filepath: answer.filepath ?? "", failure };
  }

  return {
    ok: true,
    envName: answer.envName ?? "",
    entries: answer.entries ?? [],
  };
};
