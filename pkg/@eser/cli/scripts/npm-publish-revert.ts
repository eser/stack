// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Reverts package.json to local development state.
 *
 * Copies package.json.template to package.json to restore workspace:*
 * dependencies for local development.
 *
 * @module
 */

import * as path from "@std/path";

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = path.dirname(scriptDir);
  const templatePath = path.join(pkgDir, "package.json.template");
  const outputPath = path.join(pkgDir, "package.json");

  await Deno.copyFile(templatePath, outputPath);

  // deno-lint-ignore no-console
  console.log(`Copied ${templatePath} to ${outputPath}`);
};

main();
