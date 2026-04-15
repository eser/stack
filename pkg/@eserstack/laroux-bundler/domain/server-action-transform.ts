// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Server Action Transform
 *
 * Transforms files with "use server" directive to mark exported functions
 * with React's native server reference symbols.
 *
 * This module injects:
 * 1. Server reference symbol markers ($$typeof, $$id, $$bound)
 *
 * React recognizes these markers and treats the functions as server actions,
 * enabling native <form action={fn}> and useActionState(fn, state) support.
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

const transformLogger = logging.logger.getLogger([
  "laroux-bundler",
  "server-action-transform",
]);

/**
 * Result of a server action file transformation.
 */
export interface ServerActionTransformResult {
  /** Original file path */
  filePath: string;
  /** Relative path from project root */
  relativePath: string;
  /** List of transformed action names */
  transformedActions: string[];
}

/**
 * Generate a unique action ID from file path and export name.
 *
 * Action ID format: `path/to/file#exportName`
 * Example: `src/app/actions#addComment`
 *
 * This ensures unique IDs even when multiple files export functions with the same name.
 */
function generateActionId(relativePath: string, exportName: string): string {
  // Strip file extension for cleaner IDs
  const pathWithoutExt = relativePath.replace(/\.[cm]?[jt]sx?$/, "");
  return `${pathWithoutExt}#${exportName}`;
}

/**
 * Generate code to mark a function with React's server reference symbols.
 *
 * This adds $$typeof, $$id, and $$bound properties that React uses to
 * identify and serialize server action references.
 */
function generateServerReferenceMarker(
  relativePath: string,
  exportName: string,
): string {
  const actionId = generateActionId(relativePath, exportName);

  // Use Object.defineProperties to add non-enumerable React symbols
  return `Object.defineProperties(${exportName}, {
  $$typeof: { value: Symbol.for("react.server.reference"), enumerable: false },
  $$id: { value: "${actionId}", enumerable: false },
  $$bound: { value: null, enumerable: false, writable: true }
});`;
}

/**
 * Transform a single server action file by adding React server reference markers.
 *
 * @param filePath - Path to the file to transform
 * @param relativePath - Relative path for action ID generation
 * @returns List of transformed action names, or null if file doesn't need transformation
 */
export async function transformServerActionFile(
  filePath: string,
  relativePath: string,
): Promise<string[] | null> {
  // Read file content
  let content: string;
  try {
    content = await runtime.fs.readTextFile(filePath);
  } catch (error) {
    transformLogger.warn(`Failed to read file: ${filePath}`, { error });
    return null;
  }

  // Check if file has "use server" directive at the top (file-level)
  // We only transform file-level "use server" - function-level needs different handling
  if (!hasDirective(content, "use server")) {
    transformLogger.debug(`Skipping ${filePath} - no file-level "use server"`);
    return null;
  }

  // Extract exports
  const exports = extractExports(content);
  if (exports.length === 0) {
    transformLogger.debug(`Skipping ${filePath} - no exports found`);
    return null;
  }

  // Filter out "default" export - handle it separately if needed
  const namedExports = exports.filter((e) => e !== "default");
  if (namedExports.length === 0) {
    transformLogger.debug(`Skipping ${filePath} - only default export`);
    return null;
  }

  transformLogger.debug(
    `Transforming ${filePath} with ${namedExports.length} export(s)`,
  );

  // Build the server reference markers
  const markers = namedExports
    .map((exportName) =>
      generateServerReferenceMarker(relativePath, exportName)
    )
    .join("\n");

  // Append markers at the end of the file
  const lines = content.split("\n");
  lines.push("");
  lines.push("// Auto-generated React server reference markers");
  lines.push(markers);

  // Write transformed content
  const transformedContent = lines.join("\n");
  await runtime.fs.writeTextFile(filePath, transformedContent);

  transformLogger.debug(
    `Transformed ${filePath}: marked ${namedExports.length} action(s) with server reference symbols`,
  );

  return namedExports;
}

/**
 * Transform all server action files in a directory.
 *
 * Scans for files with "use server" directive and adds React server reference markers.
 *
 * @param serverOutputDir - Directory containing server files (e.g., dist/server)
 * @returns Array of transform results
 */
export async function transformServerActions(
  serverOutputDir: string,
): Promise<ServerActionTransformResult[]> {
  transformLogger.debug(`Scanning for server actions in: ${serverOutputDir}`);

  // Check if directory exists
  const exists = await runtime.fs.exists(serverOutputDir);
  if (!exists) {
    transformLogger.debug(`Directory does not exist: ${serverOutputDir}`);
    return [];
  }

  // Find all server action files
  // relativePath will be like "src/app/actions.ts" (full path preserved)
  const actionMatches = await analyzeServerActions(serverOutputDir, {
    projectRoot: serverOutputDir,
  });

  if (actionMatches.length === 0) {
    transformLogger.debug("No server action files found");
    return [];
  }

  transformLogger.info(
    `Found ${actionMatches.length} server action file(s) to transform`,
  );

  const results: ServerActionTransformResult[] = [];

  for (const match of actionMatches) {
    // Use relativePath directly for action IDs (e.g., "src/app/actions#addComment")
    const transformedActions = await transformServerActionFile(
      match.filePath,
      match.relativePath,
    );

    if (transformedActions !== null && transformedActions.length > 0) {
      results.push({
        filePath: match.filePath,
        relativePath: match.relativePath,
        transformedActions,
      });
    }
  }

  transformLogger.info(
    `Transformed ${results.length} server action file(s)`,
  );

  return results;
}
