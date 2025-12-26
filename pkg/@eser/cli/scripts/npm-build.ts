// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds the CLI package for npm publishing.
 *
 * This script:
 * 1. Cleans the dist/ directory
 * 2. Compiles TypeScript to JavaScript using esbuild
 * 3. Transforms package.json.template with resolved dependencies
 * 4. Writes the final package.json
 *
 * Usage: deno run -A npm-build.ts
 *
 * @module
 */

import * as path from "@std/path";
import * as esbuild from "npm:esbuild@0.24.2";

type PackageJson = {
  name: string;
  version: string;
  type?: string;
  exports?: string | Record<string, string>;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type DenoJson = {
  name: string;
  version: string;
};

const isWorkspaceDep = (spec: string): boolean => {
  return spec === "workspace:*" || spec.startsWith("workspace:");
};

const extractPackageName = (depName: string): string => {
  const parts = depName.split("/");
  return parts.length > 1 ? parts[1] : depName;
};

const getPackageVersion = async (
  pkgDir: string,
  depName: string,
): Promise<string> => {
  const packageName = extractPackageName(depName);
  const denoJsonPath = path.join(pkgDir, "..", packageName, "deno.json");

  const content = await Deno.readTextFile(denoJsonPath);
  const denoJson = JSON.parse(content) as DenoJson;

  return denoJson.version;
};

const convertWorkspaceDep = async (
  pkgDir: string,
  depName: string,
): Promise<string> => {
  const packageName = extractPackageName(depName);
  const version = await getPackageVersion(pkgDir, depName);

  return `npm:@jsr/eser__${packageName}@^${version}`;
};

const processDependencies = async (
  pkgDir: string,
  deps: Record<string, string> | undefined,
): Promise<Record<string, string> | undefined> => {
  if (deps === undefined) {
    return undefined;
  }

  const result: Record<string, string> = {};

  for (const [name, spec] of Object.entries(deps)) {
    if (isWorkspaceDep(spec)) {
      result[name] = await convertWorkspaceDep(pkgDir, name);
    } else {
      result[name] = spec;
    }
  }

  return result;
};

const findTypeScriptFiles = async (dir: string): Promise<string[]> => {
  const files: string[] = [];

  for await (const entry of Deno.readDir(dir)) {
    const fullPath = path.join(dir, entry.name);

    if (
      entry.isDirectory && entry.name !== "scripts" && entry.name !== "dist"
    ) {
      const subFiles = await findTypeScriptFiles(fullPath);
      files.push(...subFiles);
    } else if (
      entry.isFile && entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      files.push(fullPath);
    }
  }

  return files;
};

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = path.dirname(scriptDir);
  const distDir = path.join(pkgDir, "dist");
  const sourcePath = path.join(pkgDir, "package.json");

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

  // Step 2: Find all TypeScript files
  // deno-lint-ignore no-console
  console.log("2. Finding TypeScript files...");
  const tsFiles = await findTypeScriptFiles(pkgDir);
  // deno-lint-ignore no-console
  console.log(`   Found ${tsFiles.length} files to compile`);

  // Step 3: Compile TypeScript to JavaScript using esbuild
  // deno-lint-ignore no-console
  console.log("3. Compiling TypeScript to JavaScript...");

  for (const tsFile of tsFiles) {
    const relativePath = path.relative(pkgDir, tsFile);
    const jsPath = path.join(distDir, relativePath.replace(/\.ts$/, ".js"));
    const jsDir = path.dirname(jsPath);

    await Deno.mkdir(jsDir, { recursive: true });

    const result = await esbuild.build({
      entryPoints: [tsFile],
      outfile: jsPath,
      format: "esm",
      platform: "node",
      target: "esnext",
      bundle: false,
      packages: "external", // Keep all npm packages external
    });

    if (result.errors.length > 0) {
      // deno-lint-ignore no-console
      console.error(`   Error compiling ${relativePath}:`, result.errors);
      throw new Error("Compilation failed");
    }

    // Post-process: Replace .ts imports with .js
    let content = await Deno.readTextFile(jsPath);
    content = content.replace(/from\s*["'](\.[^"']+)\.ts["']/g, 'from "$1.js"');
    content = content.replace(
      /import\s*\(\s*["'](\.[^"']+)\.ts["']\s*\)/g,
      'import("$1.js")',
    );
    await Deno.writeTextFile(jsPath, content);
  }

  // deno-lint-ignore no-console
  console.log(`   Compiled ${tsFiles.length} files to dist/`);

  // Step 4: Create bin.js with proper shebang
  // deno-lint-ignore no-console
  console.log("4. Creating bin.js with shebang...");
  const binContent = `#!/usr/bin/env node
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { main } from "./main.js";

await main();
`;
  await Deno.writeTextFile(path.join(distDir, "bin.js"), binContent);

  // Step 5: Generate dist/package.json
  // deno-lint-ignore no-console
  console.log("5. Generating dist/package.json...");
  const sourceContent = await Deno.readTextFile(sourcePath);
  const pkg = JSON.parse(sourceContent) as PackageJson;

  // Set name to "eser" for npx
  pkg.name = "eser";

  // Update exports and bin (relative within dist/)
  pkg.exports = "./main.js";
  pkg.bin = { eser: "./bin.js" };

  // Process dependencies
  pkg.dependencies = await processDependencies(pkgDir, pkg.dependencies);
  pkg.devDependencies = await processDependencies(pkgDir, pkg.devDependencies);

  // Write to dist/package.json
  const distPackageJsonPath = path.join(distDir, "package.json");
  const outputContent = JSON.stringify(pkg, null, 2) + "\n";
  await Deno.writeTextFile(distPackageJsonPath, outputContent);

  // deno-lint-ignore no-console
  console.log(`\nGenerated ${distPackageJsonPath}`);
  // deno-lint-ignore no-console
  console.log(`  name: ${pkg.name}`);
  // deno-lint-ignore no-console
  console.log(`  exports: ${pkg.exports}`);
  // deno-lint-ignore no-console
  console.log(`  bin: ${JSON.stringify(pkg.bin)}`);

  if (pkg.dependencies !== undefined) {
    // deno-lint-ignore no-console
    console.log("\nDependencies:");
    for (const [name, spec] of Object.entries(pkg.dependencies)) {
      // deno-lint-ignore no-console
      console.log(`  ${name}: ${spec}`);
    }
  }

  // Step 6: Copy README.md
  // deno-lint-ignore no-console
  console.log("6. Copying README.md...");
  const readmePath = path.join(pkgDir, "README.md");
  const distReadmePath = path.join(distDir, "README.md");
  await Deno.copyFile(readmePath, distReadmePath);

  // Cleanup esbuild
  esbuild.stop();

  // deno-lint-ignore no-console
  console.log("\n✓ Build complete!");
  // deno-lint-ignore no-console
  console.log("\nTo publish: cd pkg/@eser/cli/dist && npm publish");
};

main();
