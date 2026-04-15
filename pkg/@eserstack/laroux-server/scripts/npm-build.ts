// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds the laroux package for npm publishing.
 *
 * This script:
 * 1. Cleans the dist/ directory
 * 2. Bundles TypeScript using esbuild with Deno workspace resolver
 * 3. Adds shebang for Node.js execution
 * 4. Generates package.json for npm
 * 5. Copies README.md
 *
 * Usage: deno run --allow-all ./npm-build.ts
 *
 * @module
 */

import * as esbuild from "esbuild";
import { runtime } from "@eserstack/standards/cross-runtime";

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

type DenoJson = {
  exports?: Record<string, string>;
};

// Packages with native modules that must be external
const EXTERNAL_PACKAGES = [
  "tailwindcss",
  "@tailwindcss/*",
  "lightningcss",
];

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

const createDenoWorkspacePlugin = (projectRoot: string): esbuild.Plugin => ({
  name: "deno-workspace",
  setup(build) {
    build.onResolve(
      { filter: /^@eser\// },
      async (args): Promise<esbuild.OnResolveResult | undefined> => {
        const parts = args.path.split("/");
        const pkgName = parts.slice(0, 2).join("/");
        const subpath = parts.slice(2).join("/");

        const denoJsonPath = runtime.path.join(
          projectRoot,
          "pkg",
          pkgName,
          "deno.json",
        );

        try {
          const denoJson = JSON.parse(
            await runtime.fs.readTextFile(denoJsonPath),
          ) as DenoJson;
          const exports = denoJson.exports ?? {};

          const exportKey = subpath ? "./" + subpath : ".";
          let exportPath = exports[exportKey];

          if (exportPath === undefined && subpath) {
            exportPath = exports[subpath];
          }

          if (exportPath !== undefined) {
            const fullPath = runtime.path.join(
              projectRoot,
              "pkg",
              pkgName,
              exportPath.replace(/^\.\//, ""),
            );
            const realPath = await runtime.fs.realPath(fullPath);
            return { path: realPath };
          }
        } catch {
          // Package not found locally, let esbuild handle it
        }
        return undefined;
      },
    );

    build.onResolve({ filter: /^jsr:/ }, () => ({ external: true }));
  },
});

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = runtime.path.dirname(scriptDir);
  const projectRoot = runtime.path.resolve(pkgDir, "../../..");
  const distDir = runtime.path.join(pkgDir, "dist");
  const mainTsPath = runtime.path.join(pkgDir, "cli.ts");

  // deno-lint-ignore no-console
  console.log("Building @eserstack/laroux for npm...\n");

  // Step 1: Clean dist directory
  // deno-lint-ignore no-console
  console.log("1. Cleaning dist directory...");
  try {
    await runtime.fs.remove(distDir, { recursive: true });
  } catch {
    // Directory doesn't exist
  }
  await runtime.fs.mkdir(distDir, { recursive: true });

  // Step 2: Bundle using esbuild with Deno workspace resolver
  // deno-lint-ignore no-console
  console.log("2. Bundling with esbuild...");
  // deno-lint-ignore no-console
  console.log(`   External packages: ${EXTERNAL_PACKAGES.join(", ")}`);

  try {
    const result = await esbuild.build({
      entryPoints: [mainTsPath],
      bundle: true,
      outdir: distDir,
      splitting: true,
      entryNames: "laroux",
      chunkNames: "chunks/[name]-[hash]",
      format: "esm",
      platform: "node",
      target: "node18",
      minify: true,
      external: [...EXTERNAL_PACKAGES, "npm:*"],
      plugins: [
        createImportMetaMainPlugin(mainTsPath),
        createDenoWorkspacePlugin(projectRoot),
      ],
      logLevel: "warning",
    });

    if (result.errors.length > 0) {
      // deno-lint-ignore no-console
      console.error("Bundle failed:");
      for (const error of result.errors) {
        // deno-lint-ignore no-console
        console.error(`  - ${error.text}`);
      }
      throw new Error("Bundle failed");
    }
  } catch (error) {
    // deno-lint-ignore no-console
    console.error("Bundle threw exception:", error);
    throw error;
  } finally {
    await esbuild.stop();
  }

  // deno-lint-ignore no-console
  console.log("   Bundle created successfully");

  // Step 3: Add shebang to main entry file
  // deno-lint-ignore no-console
  console.log("3. Adding shebang...");
  const bundlePath = runtime.path.join(distDir, "laroux.js");
  const content = await runtime.fs.readTextFile(bundlePath);
  const shebang = "#!/usr/bin/env node\n";
  await runtime.fs.writeTextFile(bundlePath, shebang + content);

  // Step 4: Generate dist/package.json
  // deno-lint-ignore no-console
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
      "@tailwindcss/oxide": "^4.1.8",
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

  // deno-lint-ignore no-console
  console.log(`   name: ${pkg.name}`);
  // deno-lint-ignore no-console
  console.log(`   version: ${pkg.version}`);
  // deno-lint-ignore no-console
  console.log(`   dependencies: ${JSON.stringify(pkg.dependencies)}`);

  // Step 5: Copy README.md
  // deno-lint-ignore no-console
  console.log("5. Copying README.md...");
  try {
    await runtime.fs.copyFile(
      runtime.path.join(pkgDir, "README.md"),
      runtime.path.join(distDir, "README.md"),
    );
  } catch {
    await runtime.fs.writeTextFile(
      runtime.path.join(distDir, "README.md"),
      "# laroux\n\nlaroux.js framework CLI.\n",
    );
  }

  // deno-lint-ignore no-console
  console.log("\n✓ Build complete!");
  // deno-lint-ignore no-console
  console.log(
    "\nTo publish: cd pkg/@eserstack/laroux-server/dist && npm publish",
  );
};

main();
