// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Client Action Stub Generator
 *
 * Transforms "use server" files into client-side stubs for the client bundle.
 * When the client bundle imports from a "use server" file, it gets stub functions
 * that call the server's /action endpoint with the correct action ID.
 *
 * This allows users to:
 * 1. Write server actions in files with "use server" directive
 * 2. Import and call those functions directly from client components
 * 3. The bundler handles the RPC bridging automatically
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";
import {
  analyzeServerActions,
  extractExports,
  hasDirective,
} from "@eserstack/codebase/directive-analysis";

const stubLogger = logging.logger.getLogger([
  "laroux-bundler",
  "client-action-stub",
]);

/**
 * Result of stub generation for a single file.
 */
export interface ClientActionStubResult {
  /** Original file path */
  filePath: string;
  /** Relative path from project root */
  relativePath: string;
  /** List of exported action names */
  exportedActions: string[];
}

/**
 * Generate action ID from file path and export name.
 * Must match the server-side generateActionId format.
 */
function generateActionId(relativePath: string, exportName: string): string {
  // Strip file extension for cleaner IDs
  const pathWithoutExt = relativePath.replace(/\.[cm]?[jt]sx?$/, "");
  return `${pathWithoutExt}#${exportName}`;
}

/**
 * Generate a client-side stub function for a server action.
 *
 * The stub:
 * 1. Creates an async function that calls the global __callServer
 * 2. Marks it with React's server reference symbols ($$typeof, $$id, $$bound)
 * 3. React recognizes these markers and handles form binding automatically
 */
function generateStubFunction(
  relativePath: string,
  exportName: string,
): string {
  const actionId = generateActionId(relativePath, exportName);

  // Create a function with server reference markers
  // The global __callServer is provided by the client bootstrap
  return `export const ${exportName} = Object.assign(
  async function ${exportName}(...args) {
    if (typeof globalThis.__callServer !== "function") {
      throw new Error("Server actions not initialized. Ensure client bootstrap provides __callServer.");
    }
    return globalThis.__callServer("${actionId}", args);
  },
  {
    $$typeof: Symbol.for("react.server.reference"),
    $$id: "${actionId}",
    $$bound: null
  }
);`;
}

/**
 * Generate client stub content for a "use server" file.
 *
 * @param relativePath - Relative path of the file (for action ID generation)
 * @param exports - List of exported function names
 * @returns Generated stub file content
 */
function generateStubContent(
  relativePath: string,
  exports: string[],
): string {
  const header = `/**
 * Auto-generated client stubs for server actions
 * Original file: ${relativePath}
 *
 * These stubs call the server's /action endpoint with the correct action ID.
 * Action ID format: path/to/file#exportName
 */

`;

  const stubs = exports
    .map((exportName) => generateStubFunction(relativePath, exportName))
    .join("\n\n");

  return header + stubs + "\n";
}

/**
 * Transform a single "use server" file into client stubs.
 *
 * @param filePath - Absolute path to the file
 * @param relativePath - Relative path for action ID generation
 * @returns List of exported action names, or null if not a "use server" file
 */
export async function generateClientStub(
  filePath: string,
  relativePath: string,
): Promise<string[] | null> {
  // Read file content
  let content: string;
  try {
    content = await runtime.fs.readTextFile(filePath);
  } catch (error) {
    stubLogger.warn(`Failed to read file: ${filePath}`, { error });
    return null;
  }

  // Check if file has "use server" directive at the top
  if (!hasDirective(content, "use server")) {
    return null;
  }

  // Extract exports
  const exports = extractExports(content);
  if (exports.length === 0) {
    stubLogger.debug(`Skipping ${filePath} - no exports found`);
    return null;
  }

  // Filter out "default" export - we only handle named exports for now
  const namedExports = exports.filter((e) => e !== "default");
  if (namedExports.length === 0) {
    stubLogger.debug(`Skipping ${filePath} - only default export`);
    return null;
  }

  stubLogger.debug(
    `Generating stubs for ${filePath} with ${namedExports.length} export(s)`,
  );

  // Generate stub content
  const stubContent = generateStubContent(relativePath, namedExports);

  // Overwrite the file with stubs (in virtual source, not original)
  await runtime.fs.writeTextFile(filePath, stubContent);

  stubLogger.debug(
    `Generated client stubs: ${namedExports.join(", ")}`,
  );

  return namedExports;
}

/**
 * Transform all "use server" files in a directory into client stubs.
 *
 * This is used during client bundling to replace server action files
 * with client-side stubs that call the /action endpoint.
 *
 * @param virtualSrcDir - Virtual source directory (e.g., dist/_bundle_src/src)
 * @param projectRoot - Project root for relative path calculation
 * @returns Array of stub generation results
 */
export async function generateClientActionStubs(
  virtualSrcDir: string,
  projectRoot: string,
): Promise<ClientActionStubResult[]> {
  stubLogger.debug(`Scanning for server actions in: ${virtualSrcDir}`);

  // Check if directory exists
  const exists = await runtime.fs.exists(virtualSrcDir);
  if (!exists) {
    stubLogger.debug(`Directory does not exist: ${virtualSrcDir}`);
    return [];
  }

  // Find all server action files
  const actionMatches = await analyzeServerActions(virtualSrcDir, {
    projectRoot,
  });

  if (actionMatches.length === 0) {
    stubLogger.debug("No server action files found");
    return [];
  }

  stubLogger.info(
    `Found ${actionMatches.length} server action file(s) to generate stubs for`,
  );

  const results: ClientActionStubResult[] = [];

  for (const match of actionMatches) {
    const exportedActions = await generateClientStub(
      match.filePath,
      match.relativePath,
    );

    if (exportedActions !== null && exportedActions.length > 0) {
      results.push({
        filePath: match.filePath,
        relativePath: match.relativePath,
        exportedActions,
      });
    }
  }

  stubLogger.info(
    `Generated stubs for ${results.length} server action file(s)`,
  );

  return results;
}
