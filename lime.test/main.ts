// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as lime from "../lime/mod.ts";

export const instance = lime.lime()
  .setBaseUrl(import.meta.url)
  .loadManifest();
// .setOptions(options)

if (import.meta.main) {
  await instance.dev() // <!— dev mode
    .start();
}

console.log(instance.state.baseUrl);
console.log(instance.state.manifests);
