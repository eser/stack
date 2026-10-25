// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Imports of the modules a laroux server loads from its build output.
 *
 * The runtime keeps every imported module under its URL until the process
 * exits, so importing a rebuilt file by its plain file URL returns the code it
 * had when it was first imported. These imports add the build id to the URL:
 * after a dev rebuild the server loads the rebuilt modules, and within one
 * build each module loads once.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as toFileUrl from "@std/path/to-file-url";

/**
 * The URL to import a module of one build by: its file URL with the build id
 * as the `v` query parameter.
 *
 * The URL is built at run time on purpose: `deno publish` rewrites the
 * specifier of a dynamic import it can analyze.
 *
 * @param filePath - Absolute path of the module
 * @param buildId - Id of the build whose modules are loaded
 * @returns The file URL with `?v=<buildId>`
 */
export function toBuildModuleUrl(filePath: string, buildId: string): string {
  const url = toFileUrl.toFileUrl(filePath);
  url.searchParams.set("v", buildId);
  return url.href;
}

/**
 * Import a module of one build, or return null when the build wrote no file
 * at that path, such as the API route registry of an app without route.ts
 * files. An error the import throws propagates.
 *
 * @param filePath - Absolute path of the module
 * @param buildId - Id of the build whose modules are loaded
 * @returns The module's exports, or null when the file does not exist
 */
export async function importOptionalBuildModule(
  filePath: string,
  buildId: string,
): Promise<Readonly<Record<string, unknown>> | null> {
  if (!(await runtime.fs.exists(filePath))) {
    return null;
  }

  return await import(toBuildModuleUrl(filePath, buildId));
}
