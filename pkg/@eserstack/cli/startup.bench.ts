// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI startup benchmarks — measures module loading and command dispatch costs.
 *
 * Run: deno bench --allow-all pkg/@eserstack/cli/startup.bench.ts
 *
 * @module
 */

import * as mitata from "mitata";
const group = "cli-startup";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("import main.ts (module load cost)", async () => {
        // Dynamic import to measure the cost of loading the CLI module graph.
        // Deno caches modules after first load, so this measures warm-cache cost.
        const mod = await import("./main.ts");

        // Prevent dead-code elimination
        if (mod.main === undefined) throw new Error("unreachable");
      })
      .baseline();
    mitata.bench(
      "import @eserstack/codebase/validation (workflows, on-demand)",
      async () => {
        const mod = await import("@eserstack/codebase/validation");

        if (mod.getWorkflowTools === undefined) throw new Error("unreachable");
      },
    );
    mitata.bench(
      "import @eserstack/kit/recipes/schema (on-demand)",
      async () => {
        const mod = await import("@eserstack/kit/recipes/schema");

        if (mod.validateRegistryManifest === undefined) {
          throw new Error("unreachable");
        }
      },
    );
    mitata.bench(
      "import @eserstack/kit/recipes/fetcher (on-demand)",
      async () => {
        const mod = await import("@eserstack/kit/recipes/fetcher");

        if (mod.fetchRegistry === undefined) throw new Error("unreachable");
      },
    );
    mitata.bench(
      "import @eserstack/kit/recipes/applier (on-demand)",
      async () => {
        const mod = await import("@eserstack/kit/recipes/applier");

        if (mod.applyRecipe === undefined) throw new Error("unreachable");
      },
    );
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
