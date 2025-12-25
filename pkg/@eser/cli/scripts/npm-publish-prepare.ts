// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Prepares package.json for npm publishing.
 *
 * Reads package.json.template, replaces workspace:* dependencies with
 * npm:@jsr/eser__<package>@^<version>, sets name to "eser", and writes
 * the result to package.json.
 *
 * @module
 */

import * as path from "@std/path";

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
  // @eser/codebase -> codebase
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

  // @eser/codebase -> npm:@jsr/eser__codebase@^0.8.0
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

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = path.dirname(scriptDir);
  const templatePath = path.join(pkgDir, "package.json.template");
  const outputPath = path.join(pkgDir, "package.json");

  // Read template
  const templateContent = await Deno.readTextFile(templatePath);
  const pkg = JSON.parse(templateContent) as PackageJson;

  // Set name to "eser" for npx
  pkg.name = "eser";

  // Process dependencies
  pkg.dependencies = await processDependencies(pkgDir, pkg.dependencies);
  pkg.devDependencies = await processDependencies(pkgDir, pkg.devDependencies);

  // Write output
  const outputContent = JSON.stringify(pkg, null, 2) + "\n";
  await Deno.writeTextFile(outputPath, outputContent);

  // deno-lint-ignore no-console
  console.log(`Generated ${outputPath}`);
  // deno-lint-ignore no-console
  console.log(`  name: ${pkg.name}`);

  if (pkg.dependencies !== undefined) {
    for (const [name, spec] of Object.entries(pkg.dependencies)) {
      // deno-lint-ignore no-console
      console.log(`  ${name}: ${spec}`);
    }
  }
};

main();
