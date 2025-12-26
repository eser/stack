// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds the CLI package for npm publishing.
 *
 * This script:
 * 1. Cleans the dist/ directory
 * 2. Bundles TypeScript to single JS file using deno bundle
 * 3. Adds shebang for Node.js execution
 * 4. Generates minimal package.json (no dependencies - all bundled)
 * 5. Copies README.md
 *
 * Usage: deno run -A npm-build.ts
 *
 * @module
 */

import * as path from "@std/path";

type PackageJson = {
  name: string;
  version: string;
  type?: string;
  bin?: Record<string, string>;
  repository?: {
    type: string;
    url: string;
  };
};

type SourcePackageJson = {
  version: string;
};

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = path.dirname(scriptDir);
  const distDir = path.join(pkgDir, "dist");
  const mainTsPath = path.join(pkgDir, "main.ts");
  const bundlePath = path.join(distDir, "eser.js");

  // deno-lint-ignore no-console
  console.log("Building @eser/cli for npm...\n");

  // Step 1: Clean dist directory
  // deno-lint-ignore no-console
  console.log("1. Cleaning dist directory...");
  try {
    await Deno.remove(distDir, { recursive: true });
  } catch {
    // Directory doesn't exist, that's fine
  }
  await Deno.mkdir(distDir, { recursive: true });

  // Step 2: Bundle with deno bundle
  // deno-lint-ignore no-console
  console.log("2. Bundling with deno bundle...");
  const bundleCmd = new Deno.Command("deno", {
    args: [
      "bundle",
      mainTsPath,
      "-o",
      bundlePath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const bundleResult = await bundleCmd.output();

  if (!bundleResult.success) {
    const stderr = new TextDecoder().decode(bundleResult.stderr);
    // deno-lint-ignore no-console
    console.error("Bundle failed:", stderr);
    throw new Error("Bundle failed");
  }

  // deno-lint-ignore no-console
  console.log("   Bundle created successfully");

  // Step 3: Prepend shebang to bundle
  // deno-lint-ignore no-console
  console.log("3. Adding shebang...");
  const bundleContent = await Deno.readTextFile(bundlePath);
  const shebang = "#!/usr/bin/env node\n";
  await Deno.writeTextFile(bundlePath, shebang + bundleContent);

  // Step 4: Generate dist/package.json
  // deno-lint-ignore no-console
  console.log("4. Generating dist/package.json...");

  // Read version from source package.json
  const sourcePackageJson = JSON.parse(
    await Deno.readTextFile(path.join(pkgDir, "package.json")),
  ) as SourcePackageJson;

  const pkg: PackageJson = {
    name: "eser",
    version: sourcePackageJson.version,
    type: "module",
    bin: { eser: "./eser.js" },
    repository: {
      type: "git",
      url: "https://github.com/eser/stack",
    },
  };

  const distPackageJsonPath = path.join(distDir, "package.json");
  await Deno.writeTextFile(
    distPackageJsonPath,
    JSON.stringify(pkg, null, 2) + "\n",
  );

  // deno-lint-ignore no-console
  console.log(`   name: ${pkg.name}`);
  // deno-lint-ignore no-console
  console.log(`   version: ${pkg.version}`);
  // deno-lint-ignore no-console
  console.log(`   bin: ${JSON.stringify(pkg.bin)}`);

  // Step 5: Copy README.md
  // deno-lint-ignore no-console
  console.log("5. Copying README.md...");
  const readmePath = path.join(pkgDir, "README.md");
  const distReadmePath = path.join(distDir, "README.md");
  await Deno.copyFile(readmePath, distReadmePath);

  // deno-lint-ignore no-console
  console.log("\n✓ Build complete!");
  // deno-lint-ignore no-console
  console.log("\nTo publish: cd pkg/@eser/cli/dist && npm publish");
};

main();
