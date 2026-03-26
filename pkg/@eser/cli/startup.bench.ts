// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI startup benchmarks — measures module loading and command dispatch costs.
 *
 * Run: deno bench --allow-all pkg/@eser/cli/startup.bench.ts
 *
 * @module
 */

const group = "cli-startup";

Deno.bench(
  "import main.ts (module load cost)",
  { group, baseline: true },
  async () => {
    // Dynamic import to measure the cost of loading the CLI module graph.
    // Deno caches modules after first load, so this measures warm-cache cost.
    const mod = await import("./main.ts");

    // Prevent dead-code elimination
    if (mod.main === undefined) throw new Error("unreachable");
  },
);

Deno.bench(
  "import registry.ts (routing table)",
  { group },
  async () => {
    const mod = await import("./registry.ts");

    if (mod.registry === undefined) throw new Error("unreachable");
  },
);

Deno.bench(
  "import @eser/registry/schema (on-demand)",
  { group },
  async () => {
    const mod = await import("@eser/registry/schema");

    if (mod.validateRegistryManifest === undefined) {
      throw new Error("unreachable");
    }
  },
);

Deno.bench(
  "import @eser/registry/fetcher (on-demand)",
  { group },
  async () => {
    const mod = await import("@eser/registry/fetcher");

    if (mod.fetchRegistry === undefined) throw new Error("unreachable");
  },
);

Deno.bench(
  "import @eser/registry/applier (on-demand)",
  { group },
  async () => {
    const mod = await import("@eser/registry/applier");

    if (mod.applyRecipe === undefined) throw new Error("unreachable");
  },
);
