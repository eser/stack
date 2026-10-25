// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as adapters from "./mod.ts";

// factoryFor exists so a single-provider caller gets the same bridge-first
// preference as defaultFactories without importing all eight adapters. `ai ask`
// used to hand-roll a switch over the TS adapters, which meant it silently never
// used the Go bridge for any provider.

Deno.test("factoryFor returns a factory for every known provider", async () => {
  const providers = [
    "anthropic",
    "openai",
    "gemini",
    "vertexai",
    "claude-code",
    "ollama",
    "opencode",
    "kiro",
  ];

  const factories = await Promise.all(
    providers.map((provider) => adapters.factoryFor(provider)),
  );

  for (const [index, provider] of providers.entries()) {
    const factory = factories[index];

    assert.assert(factory !== undefined, `no factory for ${provider}`);
    assert.assertEquals(factory.provider, provider);
  }
});

Deno.test("factoryFor is undefined for an unknown provider", async () => {
  assert.assertEquals(await adapters.factoryFor("nonesuch"), undefined);
});

// The two entry points must not disagree about which implementation serves a
// provider — that was the whole defect: one path used the bridge, the other
// never did.
Deno.test("factoryFor agrees with defaultFactories", async () => {
  const all = await adapters.defaultFactories();
  const singles = await Promise.all(
    all.map((expected) => adapters.factoryFor(expected.provider)),
  );

  for (const [index, expected] of all.entries()) {
    const single = singles[index];

    assert.assert(
      single === expected,
      `${expected.provider}: factoryFor returned a different implementation ` +
        `than defaultFactories`,
    );
  }
});
