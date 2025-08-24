// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as lime from "@cool/lime";
import { manifest } from "./manifest.js";

/**
 * Multi-adapter Lime application example
 * Demonstrates React, Preact, and Static components in one app
 */

const registry = new lime.LimeRegistry();

// Execute all limeModule exports to register routes
for (const limeModule of manifest.exports) {
  if (typeof limeModule === "function") {
    limeModule(registry);
  }
}

export const instance = lime.builder()
  .setBaseUrl(import.meta.url)
  .loadManifest(); // This loads the YAML manifest for configuration

// Add the routes from the registry to the router
instance.state.router.loadFromRegistry?.(registry) ?? (() => {
  console.warn("Router doesn't support loadFromRegistry method");
})();

if (import.meta.main) {
  await instance.execute();
}

console.log("🍋 Multi-adapter Lime app initialized");
console.log("Base URL:", instance.state.baseUrl);
console.log("Manifests loaded:", instance.state.manifests.length);
console.log("Web manifests loaded:", instance.state.webManifests.length);
