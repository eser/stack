// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runModes from "../standards/run-modes.ts";
import * as appserver from "../appserver/mod.ts";

export type LimeExportedSymbol = unknown;

export interface LimeManifest {
  baseUrl: string;
  exports: Array<[string, Array<[string, LimeExportedSymbol]>]>;
}

export interface LimeOptions {
  basePath: string;
}

export interface LimeState {
  manifest: LimeManifest | null;
  options: LimeOptions;
}

export class Lime extends appserver.AppServer {
  state: LimeState;

  constructor(options: Partial<LimeOptions> = {}) {
    super();

    this.state = {
      manifest: null,
      options: {
        basePath: ".",
        ...options,
      },
    };
  }

  setManifest(manifest: LimeManifest | null): Lime {
    this.state.manifest = manifest;

    return this;
  }

  setOptions(options: LimeOptions): Lime {
    this.state.options = options;

    return this;
  }

  dev(): Lime {
    this.runMode = runModes.RunMode.Development;

    return this;
  }

  start(): void {
    // this.execute(_options);
  }
}
