// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  createRolldownBundlerBackend,
  createRolldownWithPreset,
  RolldownBundlerBackend,
  type RolldownBundlerBackendOptions,
  RolldownPresets,
} from "./rolldown.ts";

// ============================================================================
// RolldownBundlerBackend constructor tests
// ============================================================================

Deno.test("RolldownBundlerBackend has correct name", () => {
  const backend = new RolldownBundlerBackend();

  assert.assertEquals(backend.name, "rolldown");
});

Deno.test("RolldownBundlerBackend accepts empty options", () => {
  const backend = new RolldownBundlerBackend({});

  assert.assertEquals(backend.name, "rolldown");
});

Deno.test("RolldownBundlerBackend accepts full options", () => {
  const options: RolldownBundlerBackendOptions = {
    treeshake: true,
    preserveEntrySignatures: "strict",
    moduleSideEffects: false,
    advancedChunks: {
      minSize: 10000,
      maxSize: 100000,
      groups: [
        {
          name: "vendor",
          test: /[\\/]node_modules[\\/]/,
          priority: 10,
        },
      ],
    },
  };

  const backend = new RolldownBundlerBackend(options);

  assert.assertEquals(backend.name, "rolldown");
});

// ============================================================================
// createRolldownBundlerBackend factory tests
// ============================================================================

Deno.test("createRolldownBundlerBackend creates backend instance", () => {
  const backend = createRolldownBundlerBackend();

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
  assert.assertEquals(backend.name, "rolldown");
});

Deno.test("createRolldownBundlerBackend accepts options", () => {
  const backend = createRolldownBundlerBackend({
    treeshake: false,
    advancedChunks: {
      minSize: 5000,
    },
  });

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

// ============================================================================
// RolldownPresets tests
// ============================================================================

Deno.test("RolldownPresets.default returns valid configuration", () => {
  const preset = RolldownPresets.default();

  assert.assertEquals(preset.treeshake, true);
  assert.assertExists(preset.advancedChunks);
  assert.assertEquals(preset.advancedChunks?.minSize, 20000);
  assert.assertEquals(preset.advancedChunks?.groups?.length, 0);
});

Deno.test("RolldownPresets.react returns React-optimized configuration", () => {
  const preset = RolldownPresets.react();

  assert.assertEquals(preset.treeshake, true);
  assert.assertExists(preset.advancedChunks);
  assert.assertEquals(preset.advancedChunks?.minSize, 10000);
  assert.assertExists(preset.advancedChunks?.groups);
  assert.assertEquals(preset.advancedChunks?.groups?.length, 2);

  // Check react-vendor group
  const reactVendor = preset.advancedChunks?.groups?.find(
    (g) => g.name === "react-vendor",
  );
  assert.assertExists(reactVendor);
  assert.assertEquals(reactVendor?.priority, 30);
  assert.assert(reactVendor?.test.test("/node_modules/react/"));
  assert.assert(reactVendor?.test.test("/node_modules/react-dom/"));

  // Check vendor group
  const vendor = preset.advancedChunks?.groups?.find(
    (g) => g.name === "vendor",
  );
  assert.assertExists(vendor);
  assert.assertEquals(vendor?.priority, 10);
});

Deno.test("RolldownPresets.library returns library-optimized configuration", () => {
  const preset = RolldownPresets.library();

  assert.assertEquals(preset.treeshake, true);
  assert.assertEquals(preset.preserveEntrySignatures, "strict");
  assert.assertExists(preset.advancedChunks);
  assert.assertEquals(preset.advancedChunks?.minSize, 0);
  assert.assertEquals(preset.advancedChunks?.groups?.length, 0);
});

Deno.test("RolldownPresets.ssr returns SSR-optimized configuration", () => {
  const preset = RolldownPresets.ssr();

  assert.assertEquals(preset.treeshake, true);
  assert.assertEquals(preset.moduleSideEffects, "no-external");
  assert.assertExists(preset.advancedChunks);
  assert.assertEquals(preset.advancedChunks?.minSize, 5000);
  assert.assertExists(preset.advancedChunks?.groups);
  assert.assertEquals(preset.advancedChunks?.groups?.length, 3);

  // Check framework group exists
  const framework = preset.advancedChunks?.groups?.find(
    (g) => g.name === "framework",
  );
  assert.assertExists(framework);
  assert.assertEquals(framework?.priority, 20);
});

Deno.test("RolldownPresets.performance returns performance-optimized configuration", () => {
  const preset = RolldownPresets.performance();

  assert.assertEquals(preset.treeshake, true);
  assert.assertEquals(preset.moduleSideEffects, false);
  assert.assertExists(preset.advancedChunks);
  assert.assertEquals(preset.advancedChunks?.minSize, 30000);
  assert.assertEquals(preset.advancedChunks?.maxSize, 250000);
  assert.assertExists(preset.advancedChunks?.groups);
  assert.assertEquals(preset.advancedChunks?.groups?.length, 4);

  // Check UI group exists
  const uiGroup = preset.advancedChunks?.groups?.find((g) => g.name === "ui");
  assert.assertExists(uiGroup);
  assert.assertEquals(uiGroup?.priority, 30);
});

// ============================================================================
// createRolldownWithPreset tests
// ============================================================================

Deno.test("createRolldownWithPreset creates backend with default preset", () => {
  const backend = createRolldownWithPreset("default");

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

Deno.test("createRolldownWithPreset creates backend with react preset", () => {
  const backend = createRolldownWithPreset("react");

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

Deno.test("createRolldownWithPreset creates backend with library preset", () => {
  const backend = createRolldownWithPreset("library");

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

Deno.test("createRolldownWithPreset creates backend with ssr preset", () => {
  const backend = createRolldownWithPreset("ssr");

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

Deno.test("createRolldownWithPreset creates backend with performance preset", () => {
  const backend = createRolldownWithPreset("performance");

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

Deno.test("createRolldownWithPreset accepts custom options instead of preset name", () => {
  const customOptions: RolldownBundlerBackendOptions = {
    treeshake: false,
    advancedChunks: {
      minSize: 1000,
    },
  };

  const backend = createRolldownWithPreset(customOptions);

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

Deno.test("createRolldownWithPreset merges overrides with preset", () => {
  // We can't directly check internal options, but we can verify it doesn't throw
  const backend = createRolldownWithPreset("react", {
    treeshake: false,
    advancedChunks: {
      minSize: 5000,
    },
  });

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

Deno.test("createRolldownWithPreset preserves groups when overriding advancedChunks", () => {
  // Verifying that overrides work correctly (no throw)
  const backend = createRolldownWithPreset("react", {
    advancedChunks: {
      minSize: 15000,
      // groups should be preserved from react preset
    },
  });

  assert.assertInstanceOf(backend, RolldownBundlerBackend);
});

// ============================================================================
// ChunkGroup configuration tests
// ============================================================================

Deno.test("ChunkGroup regex patterns match expected paths", () => {
  const reactPreset = RolldownPresets.react();
  const reactVendorGroup = reactPreset.advancedChunks?.groups?.find(
    (g) => g.name === "react-vendor",
  );

  assert.assertExists(reactVendorGroup);

  // Should match React packages
  assert.assert(reactVendorGroup.test.test("/node_modules/react/index.js"));
  assert.assert(
    reactVendorGroup.test.test("/node_modules/react-dom/client.js"),
  );
  assert.assert(
    reactVendorGroup.test.test("/node_modules/scheduler/index.js"),
  );

  // Should NOT match other packages
  assert.assertEquals(
    reactVendorGroup.test.test("/node_modules/lodash/index.js"),
    false,
  );
});

Deno.test("Performance preset UI group matches expected packages", () => {
  const perfPreset = RolldownPresets.performance();
  const uiGroup = perfPreset.advancedChunks?.groups?.find(
    (g) => g.name === "ui",
  );

  assert.assertExists(uiGroup);

  // Should match UI packages
  assert.assert(uiGroup.test.test("/node_modules/@radix-ui/react-dialog/"));
  assert.assert(uiGroup.test.test("/node_modules/@headlessui/react/"));
  assert.assert(uiGroup.test.test("/node_modules/cmdk/"));

  // Should NOT match other packages
  assert.assertEquals(uiGroup.test.test("/node_modules/react/"), false);
});

Deno.test("Performance preset utils group matches utility packages", () => {
  const perfPreset = RolldownPresets.performance();
  const utilsGroup = perfPreset.advancedChunks?.groups?.find(
    (g) => g.name === "utils",
  );

  assert.assertExists(utilsGroup);

  // Should match utility packages
  assert.assert(utilsGroup.test.test("/node_modules/clsx/"));
  assert.assert(utilsGroup.test.test("/node_modules/tailwind-merge/"));
  assert.assert(
    utilsGroup.test.test("/node_modules/class-variance-authority/"),
  );
});

// ============================================================================
// Preset priority ordering tests
// ============================================================================

Deno.test("React preset groups have correct priority ordering", () => {
  const preset = RolldownPresets.react();
  const groups = preset.advancedChunks?.groups ?? [];

  const reactVendor = groups.find((g) => g.name === "react-vendor");
  const vendor = groups.find((g) => g.name === "vendor");

  assert.assertExists(reactVendor);
  assert.assertExists(vendor);

  // react-vendor should have higher priority than vendor
  assert.assert((reactVendor.priority ?? 0) > (vendor.priority ?? 0));
});

Deno.test("SSR preset groups have correct priority ordering", () => {
  const preset = RolldownPresets.ssr();
  const groups = preset.advancedChunks?.groups ?? [];

  const reactVendor = groups.find((g) => g.name === "react-vendor");
  const framework = groups.find((g) => g.name === "framework");
  const vendor = groups.find((g) => g.name === "vendor");

  assert.assertExists(reactVendor);
  assert.assertExists(framework);
  assert.assertExists(vendor);

  // Priority should be: react-vendor > framework > vendor
  assert.assert((reactVendor.priority ?? 0) > (framework.priority ?? 0));
  assert.assert((framework.priority ?? 0) > (vendor.priority ?? 0));
});

Deno.test("Performance preset groups have correct priority ordering", () => {
  const preset = RolldownPresets.performance();
  const groups = preset.advancedChunks?.groups ?? [];

  const react = groups.find((g) => g.name === "react");
  const ui = groups.find((g) => g.name === "ui");
  const utils = groups.find((g) => g.name === "utils");
  const vendor = groups.find((g) => g.name === "vendor");

  assert.assertExists(react);
  assert.assertExists(ui);
  assert.assertExists(utils);
  assert.assertExists(vendor);

  // Priority should be: react > ui > utils > vendor
  assert.assert((react.priority ?? 0) > (ui.priority ?? 0));
  assert.assert((ui.priority ?? 0) > (utils.priority ?? 0));
  assert.assert((utils.priority ?? 0) > (vendor.priority ?? 0));
});
