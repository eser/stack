// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runModes from "@eserstack/standards/run-modes";
import * as fileLoader from "@eserstack/config/file";
import * as appRuntime from "@eserstack/app-runtime";

export type LarouxExportedSymbol = unknown;

export type LarouxManifest = {
  exports: Array<[string, Array<[string, LarouxExportedSymbol]>]>;
};

export type LarouxRuntimeOptions = {
  basePath: string;
};

export type LarouxRuntimeState = appRuntime.AppRuntimeState & {
  baseUrl: string | null;
  manifests: Array<LarouxManifest>;
  options: LarouxRuntimeOptions;
};

/**
 * A manifest queued by `LarouxRuntime.loadManifest` could not be read or
 * parsed. `start()` and `execute()` reject with it; `cause` holds the
 * underlying error, such as a `ConfigParseError` naming the file.
 */
export class LarouxManifestLoadError extends Error {
  /** The directory that was searched for the manifest. */
  readonly searchDir: string;

  /** Wraps `cause`, the error from reading the manifest in `searchDir`. */
  constructor(searchDir: string, cause: unknown) {
    super(
      `load laroux manifest from "${searchDir}": ${describeCause(cause)}`,
      { cause },
    );
    this.name = "LarouxManifestLoadError";
    this.searchDir = searchDir;
  }
}

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Reads the first manifest file found in `searchDir`. Resolves to `null` when
 * the directory has none.
 */
const readManifest = async (
  searchDir: string,
): Promise<LarouxManifest | null> => {
  try {
    const result = await fileLoader.load<LarouxManifest>(
      searchDir,
      ["manifest.yaml", "manifest.jsonc", "manifest.json", "manifest.toml"],
    );

    return result.content ?? null;
  } catch (error) {
    throw new LarouxManifestLoadError(searchDir, error);
  }
};

export const createLarouxRuntimeState = (
  options?: Partial<LarouxRuntimeOptions>,
): LarouxRuntimeState => {
  return {
    ...appRuntime.createAppRuntimeState(),
    baseUrl: null,
    manifests: [],
    options: Object.assign(
      { basePath: "" },
      options,
    ),
  };
};

export class LarouxRuntime extends appRuntime.AppRuntime<LarouxRuntimeState> {
  constructor(state?: LarouxRuntimeState) {
    super(state ?? createLarouxRuntimeState());
  }

  setBaseUrl(baseUrl: string | null): this {
    this.state.baseUrl = baseUrl;

    return this;
  }

  addManifest(manifest: LarouxManifest): this {
    this.state.manifests = [...this.state.manifests, manifest];

    return this;
  }

  /**
   * Starts reading the manifest in `baseDir` (resolved against the base URL)
   * and adds it once loaded. `start()` waits for the read and rejects with a
   * `LarouxManifestLoadError` when it fails.
   */
  loadManifest(baseDir?: string): this {
    const searchDir = fileLoader.resolvePath(
      baseDir ?? ".",
      this.state.baseUrl,
    );
    const loading = readManifest(searchDir).then((manifest) => {
      if (manifest !== null) {
        this.addManifest(manifest);
      }
    });

    // start() awaits `loading` and rethrows its error. The handler has to be
    // attached now: a read that fails before start() runs would otherwise be
    // reported as an unhandled rejection and end the process.
    loading.catch(() => {});

    this.state.awaits = [...this.state.awaits, loading];

    return this;
  }

  dev(): this {
    this.state.runMode |= runModes.RunModes.Development;

    return this;
  }

  async start(): Promise<void> {
    await this.awaitAll();
  }

  execute(): Promise<void> {
    return this.start();
  }
}
