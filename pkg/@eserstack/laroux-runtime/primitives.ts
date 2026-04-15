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

  loadManifest(baseDir?: string): this {
    const promise = fileLoader.load<LarouxManifest>(
      fileLoader.resolvePath(baseDir ?? ".", this.state.baseUrl),
      ["manifest.yaml", "manifest.jsonc", "manifest.json", "manifest.toml"],
    ).then((result) => {
      if (result.content === undefined) {
        return;
      }

      this.addManifest(result.content);
    });
    // FIXME(@eser) Handle errors.

    this.state.awaits = [...this.state.awaits, promise];

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
