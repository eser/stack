// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runModes from "@eser/standards/run-modes";
import * as fileLoader from "@eser/config/file";
import * as appRuntime from "@eser/app-runtime";

export type LimeExportedSymbol = unknown;

export type LimeManifest = {
  exports: Array<[string, Array<[string, LimeExportedSymbol]>]>;
};

export type LimeOptions = {
  basePath: string;
};

export type LimeState = appRuntime.AppRuntimeState & {
  baseUrl: string | null;
  manifests: Array<LimeManifest>;
  options: LimeOptions;
};

export const createLimeState = (options?: Partial<LimeOptions>): LimeState => {
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

export class Lime extends appRuntime.AppRuntime<LimeState> {
  constructor(state?: LimeState) {
    super(state ?? createLimeState());
  }

  setBaseUrl(baseUrl: string | null): this {
    this.state.baseUrl = baseUrl;

    return this;
  }

  addManifest(manifest: LimeManifest): this {
    this.state.manifests = [...this.state.manifests, manifest];

    return this;
  }

  loadManifest(baseDir?: string): this {
    const promise = fileLoader.load<LimeManifest>(
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
    // this.executeOpts(_options);
  }

  execute(): Promise<void> {
    return this.start();
  }
}
