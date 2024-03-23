// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runModes from "../standards/run-modes.ts";
import * as fileLoader from "../file-loader/mod.ts";
import * as appserver from "../appserver/mod.ts";

export type LimeExportedSymbol = unknown;

export type LimeManifest = {
  exports: Array<[string, Array<[string, LimeExportedSymbol]>]>;
};

export type LimeOptions = {
  basePath: string;
};

export type LimeState = {
  baseUrl: string | null;
  manifests: Array<LimeManifest>;
  options: LimeOptions;
};

export class Lime extends appserver.AppServer {
  state: LimeState;

  constructor(options?: Partial<LimeOptions>) {
    super();

    this.state = {
      baseUrl: null,
      manifests: [],
      options: Object.assign(
        { basePath: "" },
        options,
      ),
    };
  }

  setBaseUrl(baseUrl: string | null): Lime {
    this.state.baseUrl = baseUrl;

    return this;
  }

  addManifest(manifest: LimeManifest): Lime {
    this.state.manifests = [...this.state.manifests, manifest];

    return this;
  }

  loadManifest(baseDir?: string): Lime {
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

    this.awaits.push(promise);

    return this;
  }

  dev(): Lime {
    this.runMode |= runModes.RunModes.Development;

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
