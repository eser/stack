// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Module Map Generator
 * Creates the module map required by react-server-dom-esm to resolve client components
 *
 * Uses @eser/bundler for base types and utilities.
 */

import { runtime } from "@eser/standards/runtime";
import type {
  ModuleEntry as BaseModuleEntry,
  ModuleMap as BaseModuleMap,
} from "@eser/bundler";
import type { ClientComponent } from "./rsc-analyze.ts";
import { analyzeClientComponents } from "./rsc-analyze.ts";
import * as logging from "@eser/logging";

const moduleMapLogger = logging.logger.getLogger([
  "laroux-bundler",
  "rsc-module-map",
]);

// Re-export base types for backward compatibility
export type { BaseModuleEntry, BaseModuleMap };

// Laroux ModuleMapEntry - compatible with BaseModuleEntry but with mutable chunks
export type ModuleMapEntry = {
  /** Module ID/path for the client component */
  id: string;
  /** Chunk names that contain this component */
  chunks: string[];
  /** Export name (default, named export, or * for all exports) */
  name: string;
};

// Mutable version for building
export type ModuleMap = Record<string, ModuleMapEntry>;

/**
 * Generate a module map from analyzed client components
 * Uses relative paths that match React's module reference format
 */
export function generateModuleMap(
  clientComponents: ClientComponent[],
): ModuleMap {
  const moduleMap: ModuleMap = {};

  for (const component of clientComponents) {
    // Key format: Relative path from project root (e.g., "./src/app/counter.tsx")
    // This must match the $$id that React emits for the component reference
    const key = `./${component.relativePath}`;

    // Convert to bundle path: "./src/app/counter.tsx" → "src/app/counter.js"
    const bundlePath = component.relativePath.replace(/\.tsx?$/, ".js");

    // Value: module reference with proper bundle path
    // Use first export name as fallback (server.ts will use the actual export name from client reference)
    moduleMap[key] = {
      id: key, // Use relative path as ID (matches $$id in RSC stream)
      chunks: [bundlePath], // Component file path in dist/ (without /dist/ prefix for react-server-dom-esm)
      name: component.exportNames[0] ?? "default", // First export as fallback
    };
  }

  return moduleMap;
}

/**
 * Convert module map to the format expected by react-server-dom-esm bundler config
 */
export function createBundlerConfig(moduleMap: ModuleMap): ModuleMap {
  const bundlerConfig: ModuleMap = {};

  for (const [key, entry] of Object.entries(moduleMap)) {
    bundlerConfig[key] = {
      id: entry.id,
      chunks: entry.chunks,
      name: entry.name,
    };
  }

  return bundlerConfig;
}

/**
 * Save module map to a JSON file
 */
export async function saveModuleMap(
  moduleMap: ModuleMap,
  outputPath: string,
): Promise<void> {
  const json = JSON.stringify(moduleMap, null, 2);
  await runtime.fs.writeTextFile(outputPath, json);
  moduleMapLogger.debug(`📝 Module map saved to: ${outputPath}`);
}

/**
 * Load module map from a JSON file
 */
export async function loadModuleMap(filePath: string): Promise<ModuleMap> {
  const json = await runtime.fs.readTextFile(filePath);
  return JSON.parse(json);
}

/**
 * Create a client manifest for the browser
 * This is used by the client to know which components are available
 * Uses ES Module paths for standards compliance
 */
export function createClientManifest(
  clientComponents: ClientComponent[],
): ModuleMap {
  const manifest: ModuleMap = {};

  for (const component of clientComponents) {
    manifest[component.relativePath] = {
      id: component.relativePath,
      chunks: ["client.js"],
      name: component.exportNames[0] ?? "default",
    };
  }

  return manifest;
}

// CLI usage
if (import.meta.main) {
  const projectRoot = runtime.process.cwd();
  const srcDir = runtime.path.resolve(projectRoot, "src");
  const clientComponents = await analyzeClientComponents(srcDir, projectRoot);

  const moduleMap = generateModuleMap(clientComponents);
  moduleMapLogger.info("\nModule Map:", { moduleMap });

  await saveModuleMap(
    moduleMap,
    runtime.path.resolve(projectRoot, "dist/module-map.json"),
  );
}
