// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Server Action Transform
 *
 * Transforms files with "use server" directive to automatically register
 * their exported functions with the action registry.
 *
 * This module injects:
 * 1. Import statement for registerAction
 * 2. Registration calls for each exported function
 *
 * @module
 */

import { runtime } from "@eser/standards/runtime";
import * as logging from "@eser/logging";
import {
  analyzeServerActions,
  extractExports,
  hasDirective,
} from "@eser/codebase/directive-analysis";

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
  /** List of registered action names */
  registeredActions: string[];
}

/**
 * Generate a unique action ID from file path and export name.
 *
 * Format: "relativePath#exportName" (e.g., "app/actions#addComment")
 */
function generateActionId(relativePath: string, exportName: string): string {
  // Remove extension and normalize path
  const pathWithoutExt = relativePath.replace(/\.[^.]+$/, "");
  return `${pathWithoutExt}#${exportName}`;
}

/**
 * Transform a single server action file by injecting registration code.
 *
 * @param filePath - Path to the file to transform
 * @param relativePath - Relative path for action ID generation (without srcDirName)
 * @returns List of registered action names, or null if file doesn't need transformation
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

  // Build the injection code
  const registrationImport =
    `import { registerAction } from "@eser/laroux-server/action-registry";`;

  const registrationCalls = namedExports
    .map((exportName) => {
      const actionId = generateActionId(relativePath, exportName);
      return `registerAction("${actionId}", ${exportName});`;
    })
    .join("\n");

  // Find where to inject the import (after "use server" directive)
  const lines = content.split("\n");
  let insertImportIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    // Find the "use server" directive line
    if (
      line === '"use server";' ||
      line === "'use server';"
    ) {
      insertImportIndex = i + 1;
      break;
    }
  }

  // Insert the import after "use server" directive
  lines.splice(insertImportIndex, 0, registrationImport);

  // Append registration calls at the end of the file
  lines.push("");
  lines.push("// Auto-generated server action registration");
  lines.push(registrationCalls);

  // Write transformed content
  const transformedContent = lines.join("\n");
  await runtime.fs.writeTextFile(filePath, transformedContent);

  transformLogger.debug(
    `Transformed ${filePath}: registered ${namedExports.length} action(s)`,
  );

  return namedExports;
}

/**
 * Transform all server action files in a directory.
 *
 * Scans for files with "use server" directive and injects registration code.
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
    const registeredActions = await transformServerActionFile(
      match.filePath,
      match.relativePath,
    );

    if (registeredActions !== null && registeredActions.length > 0) {
      results.push({
        filePath: match.filePath,
        relativePath: match.relativePath,
        registeredActions,
      });
    }
  }

  transformLogger.info(
    `Transformed ${results.length} server action file(s)`,
  );

  return results;
}
