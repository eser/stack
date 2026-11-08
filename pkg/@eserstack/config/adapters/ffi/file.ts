// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The bridge calls behind `@eserstack/config/file`. Go finds files, picks
 * their format, reads them and parses JSON and JSONC
 * (`pkg/ajan/configfx/file.go`); YAML and TOML come back as text, which
 * `file/loader.ts` decodes. Not exported from the package.
 *
 * @module
 */

import * as client from "@eserstack/ajan/ffi/client";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

/** Whether the host separates paths the Windows way, as node:path does. */
const windows = (): boolean => crossRuntime.getPlatform() === "windows";

/**
 * Picks a file's format from its extension in Go (`configFileFormat`),
 * synchronously. The bridge loads on first use.
 *
 * @throws {Error} When the bridge is unavailable, with its load error as
 *   `cause`
 */
export const fileFormat = (path: string): number => {
  const answer = client
    .requireLibSync()
    .call("configFileFormat", { path, windows: windows() });

  if (answer.error !== undefined && answer.error !== "") {
    throw new Error(answer.error);
  }

  return answer.format ?? 0;
};

/**
 * Finds the first of `filenames` in `baseDir` and, with `searchParents`, its
 * parents, in Go (`configLocateFile`).
 *
 * @throws {Error} When the bridge is unavailable, with its load error as
 *   `cause`
 */
export const locateFile = async (
  baseDir: string,
  filenames: readonly string[],
  searchParents: boolean,
): Promise<string | undefined> => {
  const lib = await client.requireLib();
  const answer = lib.call("configLocateFile", {
    baseDir,
    filenames,
    searchParents,
  });

  if (answer.error !== undefined && answer.error !== "") {
    throw new Error(answer.error);
  }

  return answer.path;
};

/** What Go read from a configuration file. */
export type ParsedFile =
  | {
      readonly ok: true;
      readonly format: number;
      /** The JSON or JSONC content; absent for the other formats. */
      readonly content?: unknown;
      /** The text of a YAML or TOML file, for the caller to decode. */
      readonly text?: string;
    }
  | {
      readonly ok: false;
      readonly format: number;
      readonly code: string;
      readonly message: string;
    };

/**
 * Reads a configuration file in Go (`configParseFile`) and parses it when it
 * is JSON or JSONC.
 *
 * @throws {Error} When the bridge is unavailable, with its load error as
 *   `cause`
 */
export const parseFile = async (
  path: string,
  format: number | undefined,
): Promise<ParsedFile> => {
  const lib = await client.requireLib();
  const answer = lib.call("configParseFile", {
    path,
    format,
    windows: windows(),
  });

  if (answer.error !== undefined && answer.error !== "") {
    return {
      ok: false,
      format: answer.format ?? 0,
      code: answer.code ?? "",
      message: answer.error,
    };
  }

  return {
    ok: true,
    format: answer.format ?? 0,
    content: answer.content,
    text: answer.text,
  };
};
