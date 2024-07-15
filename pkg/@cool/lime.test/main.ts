// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as lime from "@cool/lime";

// TODO(@eser): lime traverses all files in the directory and looks for
// exported function named "metadata". when it finds it, it calls it and
// registers the result into a manifest.

// export const metadata = (registry) => {
//   registry.addReactRoot("/hello", <Hello />);
//   registry.addHook("/hook", fn);
//   registry.addDb("postgres", "postgres://localhost:5432");
//   registry.addStaticAsset("/static", "./static");
//   ...
// };

export const instance = lime.builder()
  .setBaseUrl(import.meta.url)
  .loadManifest();
// .setOptions(options) // (set defaults ... or load from file?)
// .loadEnvironment() // (deserialize options from env, dev mode vs)

if (import.meta.main) {
  await instance.execute();
}

console.log(instance.state.baseUrl);
console.log(instance.state.manifests);
