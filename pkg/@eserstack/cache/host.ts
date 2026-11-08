// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The host facts the Go side resolves the base directories from, and the
 * synchronous path resolution over them.
 *
 * The WASM build of the bridge runs as wasip1, without the host's platform,
 * home directory or environment, so every request that resolves a directory
 * carries them. Go owns the rules (`pkg/ajan/cachefx`); this module only reads
 * the values and sends them. Not exported from the package.
 *
 * @module
 */

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import type { AppIdentifier } from "./primitives.ts";
import * as ffiClient from "./ffi-client.ts";

const runtime = standardsCrossRuntime.runtime;

/** The environment variables the base directory rules of cachefx read. */
const HOST_ENV_NAMES: readonly string[] = [
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_CONFIG_HOME",
  "LOCALAPPDATA",
  "APPDATA",
];

/** The `host` field of the cache bridge requests. */
export interface HostFacts {
  readonly platform: string;
  readonly home: string;
  readonly env: Readonly<Record<string, string>>;
}

/** Reads the host facts of this process. */
export const currentHost = (): HostFacts => {
  const env: Record<string, string> = {};
  for (const name of HOST_ENV_NAMES) {
    const value = runtime.env.get(name);
    if (value !== undefined) {
      env[name] = value;
    }
  }

  return {
    platform: standardsCrossRuntime.getPlatform(),
    home: standardsCrossRuntime.getHomedir(),
    env,
  };
};

/** What {@link resolvePaths} asks Go for beyond the base directories. */
export interface ResolvePathsRequest {
  readonly app?: AppIdentifier;
  readonly baseDir?: string;
  readonly version?: string;
  readonly item?: string;
}

/** The base directories and, for a request with an app, its paths. */
export interface ResolvedPaths {
  readonly cacheHome: string;
  readonly dataHome: string;
  readonly configHome: string;
  readonly appDir?: string;
  readonly versionedPath?: string;
}

/**
 * Resolves the paths of `request` in Go (`cacheResolvePaths`), synchronously.
 * The bridge loads on first use.
 *
 * @throws {Error} When the bridge is unavailable (its load error is the
 *   `cause`), or Go answers an error.
 */
export const resolvePaths = (request: ResolvePathsRequest): ResolvedPaths => {
  const { app, baseDir, version, item } = request;
  const answer = ffiClient.requireLibSync().call("cacheResolvePaths", {
    host: currentHost(),
    app: app === undefined ? undefined : { name: app.name, org: app.org },
    baseDir,
    version,
    item,
  });

  if (answer.error !== undefined && answer.error !== "") {
    throw new Error(answer.error);
  }

  return {
    cacheHome: answer.cacheHome ?? "",
    dataHome: answer.dataHome ?? "",
    configHome: answer.configHome ?? "",
    appDir: answer.appDir,
    versionedPath: answer.versionedPath,
  };
};

/**
 * The app paths of `request`, which names an app.
 *
 * @throws {Error} As {@link resolvePaths}, and when the app has no name: Go
 *   answers no app paths then, as `cacheCreate` refuses one.
 */
export const resolveAppPaths = (
  request: ResolvePathsRequest & { readonly app: AppIdentifier },
): { readonly appDir: string; readonly versionedPath: string } => {
  const { appDir, versionedPath } = resolvePaths(request);
  if (appDir === undefined || versionedPath === undefined) {
    throw new Error("app.name is required");
  }

  return { appDir, versionedPath };
};
