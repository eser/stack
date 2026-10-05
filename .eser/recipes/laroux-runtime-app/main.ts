// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runtime from "@eserstack/laroux-runtime";

export const instance = runtime.createRuntime()
  .setBaseUrl(import.meta.url)
  .loadManifest();

if (import.meta.main) {
  await instance.execute();

  console.log(instance.state.baseUrl);
  console.log(instance.state.manifests);
}
