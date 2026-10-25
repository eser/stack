// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runs the self-update flow that installed v4.5.x laroux and noskills
 * binaries carry (update.ts, updateCompiledBinary) against a local release,
 * for legacy_update_test.go.
 *
 * It runs under `deno run`, not as a compiled binary, so it points execPath
 * at the binary fixture and sends the GitHub API and release download URLs
 * to the local server. Any other URL fails, which keeps the run off the
 * network.
 *
 * Environment (all required):
 *   LEGACY_UPDATE_SERVER   the local release server, e.g. http://127.0.0.1:1234
 *   LEGACY_UPDATE_BINARY   the binary fixture the update replaces
 *   LEGACY_UPDATE_COMMAND  laroux or noskills
 *   LEGACY_UPDATE_VERSION  the fixture's version, e.g. 4.5.2
 *
 * @module
 */

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import * as results from "@eserstack/primitives/results";
import * as update from "../../../pkg/@eserstack/codebase/cli-system/handlers/update.ts";

const runtime = standardsCrossRuntime.runtime;

// The hosts update.ts and version-check.ts call, in the order they are tried.
const GITHUB_PREFIXES = ["https://api.github.com/", "https://github.com/"];

const required = (key: string): string => {
  const value = runtime.env.get(key);

  if (value === undefined || value === "") {
    throw new Error(`${key} is not set; legacy_update_test.go sets it`);
  }

  return value;
};

const main = async (): Promise<number> => {
  const server = required("LEGACY_UPDATE_SERVER");
  const binary = required("LEGACY_UPDATE_BINARY");
  const command = required("LEGACY_UPDATE_COMMAND");
  const version = required("LEGACY_UPDATE_VERSION");

  const realFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const prefix = GITHUB_PREFIXES.find((p) => url.startsWith(p));

    if (prefix === undefined) {
      return Promise.reject(new Error(`unexpected request to ${url}`));
    }

    return realFetch(`${server}/${url.slice(prefix.length)}`, init);
  };

  // The compiled binary's own path, which the update replaces.
  Object.defineProperty(runtime.process, "execPath", {
    value: () => binary,
    configurable: true,
  });

  const result = await update.updateCompiledBinary(
    { command, devCommand: `deno task cli ${command}`, npmPackage: command },
    version,
  );

  return results.isFail(result) ? result.error.exitCode : 0;
};

main().then((code) => runtime.process.setExitCode(code));
