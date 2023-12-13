// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as appserver from "../appserver/mod.ts";

export class Lime extends appserver.AppServer {
  constructor() {
    super();
  }

  // deno-lint-ignore no-explicit-any
  manifest(_manifest: any): Lime {
    return this;
  }

  // deno-lint-ignore no-explicit-any
  config(_config: any): Lime {
    return this;
  }

  dev(): Lime {
    return this;
  }

  start(): void {
  }
}

export function lime() {
  return new Lime();
}

/*
lime()
  .manifest(manifest)
  .config(config)
  .dev() // <!— dev mode
  .start();
*/
