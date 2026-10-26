// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// A build script run by hand: its progress lines are its user-facing output.
/* oxlint-disable no-console */

/**
 * Builds the laroux package for npm publishing.
 *
 * This script:
 * 1. Cleans the dist/ directory
 * 2. Bundles TypeScript with esbuild
 * 3. Adds shebang for Node.js execution
 * 4. Generates package.json for npm
 * 5. Copies README.md
 *
 * Usage: node ./scripts/npm-build.ts
 *
 * @module
 */

import * as esbuild from "esbuild";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as npmExternals from "@eserstack/codebase/npm-externals";

type PackageJson = {
  name: string;
  version: string;
  type?: string;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  repository?: {
    type: string;
    url: string;
  };
};

type SourcePackageJson = {
  version: string;
};

// The externals list is shared by every npm build; see the module for the
// reasoning behind each entry (and why `@eserstack/ajan` is NOT in it).
const EXTERNAL_PACKAGES: readonly string[] = npmExternals.NPM_EXTERNAL_PACKAGES;

const createImportMetaMainPlugin = (entryPath: string): esbuild.Plugin => ({
  name: "import-meta-main",
  setup(build) {
    build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
      if (args.path === entryPath) {
        return undefined;
      }

      const source = await runtime.fs.readTextFile(args.path);

      if (!source.includes("import.meta.main")) {
        return undefined;
      }

      const transformed = source.replace(/import\.meta\.main/g, "false");

      return {
        contents: transformed,
        loader: args.path.endsWith(".tsx")
          ? "tsx"
          : args.path.endsWith(".ts")
            ? "ts"
            : args.path.endsWith(".jsx")
              ? "jsx"
              : "js",
      };
    });
  },
});

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = runtime.path.dirname(scriptDir);
  const distDir = runtime.path.join(pkgDir, "dist");
  const mainTsPath = runtime.path.join(pkgDir, "cli.ts");

  console.log("Building @eserstack/laroux for npm...\n");

  // Step 1: Clean dist directory
  console.log("1. Cleaning dist directory...");
  // Only a missing dist/ is skipped. Any other failure stops the build, since
  // chunks left over from an earlier build would be published with this one.
  if (await runtime.fs.exists(distDir)) {
    await runtime.fs.remove(distDir, { recursive: true });
  }
  await runtime.fs.mkdir(distDir, { recursive: true });

  // Step 2: Bundle using esbuild
  console.log("2. Bundling with esbuild...");
  console.log(`   External packages: ${EXTERNAL_PACKAGES.join(", ")}`);

  // A failed bundle is thrown with its context and not printed here: the
  // runtime reports the uncaught error from main() once.
  let result: esbuild.BuildResult;
  try {
    result = await esbuild.build({
      entryPoints: [mainTsPath],
      bundle: true,
      outdir: distDir,
      splitting: true,
      entryNames: "laroux",
      chunkNames: "chunks/[name]-[hash]",
      format: "esm",
      platform: "node",
      target: "node26",
      minify: true,
      // @eserstack/* imports need no plugin: pnpm links each workspace package
      // into node_modules, and esbuild reads the exports of its package.json.
      external: [...EXTERNAL_PACKAGES],
      plugins: [createImportMetaMainPlugin(mainTsPath)],
      logLevel: "warning",
    });
  } catch (error) {
    throw new Error(`bundle ${mainTsPath} with esbuild`, { cause: error });
  } finally {
    await esbuild.stop();
  }

  if (result.errors.length > 0) {
    const details = result.errors.map((error) => `  - ${error.text}`);
    throw new Error(
      `bundle ${mainTsPath} with esbuild: ${result.errors.length} error(s)\n${details.join(
        "\n",
      )}`,
    );
  }

  console.log("   Bundle created successfully");

  // Step 3: Add shebang to main entry file
  console.log("3. Adding shebang...");
  const bundlePath = runtime.path.join(distDir, "laroux.js");
  const content = await runtime.fs.readTextFile(bundlePath);
  const shebang = "#!/usr/bin/env node\n";
  await runtime.fs.writeTextFile(bundlePath, shebang + content);

  // Step 4: Generate dist/package.json
  console.log("4. Generating dist/package.json...");

  const sourcePackageJson = JSON.parse(
    await runtime.fs.readTextFile(runtime.path.join(pkgDir, "package.json")),
  ) as SourcePackageJson;

  const pkg: PackageJson = {
    name: "laroux",
    version: sourcePackageJson.version,
    type: "module",
    bin: { laroux: "./laroux.js" },
    dependencies: {
      "@tailwindcss/oxide": "^4.3.3",
      lightningcss: "^1.30.0",
      tailwindcss: "^4.1.8",
    },
    repository: {
      type: "git",
      url: "https://github.com/eser/stack",
    },
  };

  await runtime.fs.writeTextFile(
    runtime.path.join(distDir, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );

  console.log(`   name: ${pkg.name}`);
  console.log(`   version: ${pkg.version}`);
  console.log(`   dependencies: ${JSON.stringify(pkg.dependencies)}`);

  // Step 5: Copy README.md
  console.log("5. Copying README.md...");
  // The README is tracked, so a failed copy is an error, not a reason to
  // publish a placeholder page.
  await runtime.fs.copyFile(
    runtime.path.join(pkgDir, "README.md"),
    runtime.path.join(distDir, "README.md"),
  );

  console.log("\n✓ Build complete!");
  console.log(
    "\nTo publish: cd pkg/@eserstack/laroux-server/dist && npm publish",
  );
};

if (import.meta.main) {
  // Script entry point: the await runs only when this file is the program,
  // never on import. A failed build rejects and exits non-zero.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
