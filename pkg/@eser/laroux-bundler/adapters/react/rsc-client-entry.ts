// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Create Client Entry Point
 * Generates a temporary entry file that includes:
 * 1. All client components (so they're in the bundle)
 * 2. The bootstrap code from @eser/laroux-react/client/bootstrap
 * 3. A global module registry for RSC client
 */

import { runtime } from "@eser/standards/runtime";
import { copy } from "@std/fs"; // copy not available in runtime
import type { ClientComponent } from "./rsc-analyze.ts";

export async function createClientEntry(
  clientComponents: ClientComponent[],
  _projectRoot: string,
  distDir: string,
): Promise<string> {
  const entryPath = runtime.path.resolve(distDir, "_client-entry.tsx");
  // Resolve client bootstrap directory relative to laroux-react package
  // The bootstrap files are in @eser/laroux-react/client/bootstrap/
  // Path: adapters/react/ -> adapters/ -> laroux-bundler/ -> @eser/ -> pkg/ -> @eser/laroux-react/client/bootstrap
  const sourceClientDir = runtime.path.resolve(
    import.meta.dirname ?? ".",
    "../../../../@eser/laroux-react/client/bootstrap",
  );

  await runtime.fs.ensureDir(distDir);

  // Copy all client files to dist to avoid workspace package.json resolution issues
  for await (const entry of runtime.fs.readDir(sourceClientDir)) {
    if (entry.isFile) {
      const sourcePath = runtime.path.resolve(sourceClientDir, entry.name);
      const destPath = runtime.path.resolve(distDir, entry.name);
      await copy(sourcePath, destPath, { overwrite: true });
    }
  }

  // Generate import statements for all client components
  const componentImports = clientComponents.map((component, index) => {
    // Use the absolute path to the component file
    return `import * as __component_${index} from "${component.filePath}";`;
  }).join("\n");

  // Generate registry assignments for all client components
  const componentRegistry = clientComponents.map((component, index) => {
    // Register using the relative path as the key (matching module map)
    // Use ./ prefix to match the module IDs sent by the server
    const moduleId = `./${component.relativePath}`;
    return `  __RUNTIME_MODULES__["${moduleId}"] = __component_${index};`;
  }).join("\n");

  // Create the entry file content that imports components and bootstrap code
  const content = `/**
 * Auto-generated Client Entry Point - Runtime Bundle
 * This file contains the bootstrap code and all client components
 */

${componentImports}

// Create global module registry for runtime components
if (typeof globalThis !== "undefined") {
  globalThis.__RUNTIME_MODULES__ = globalThis.__RUNTIME_MODULES__ ?? {};
}
const __RUNTIME_MODULES__ = typeof globalThis !== "undefined"
  ? globalThis.__RUNTIME_MODULES__
  : {};

// Register all client components
${componentRegistry}

// Import and run the bootstrap code (copied to dist/)
import "./entry.tsx";
`;

  await runtime.fs.writeTextFile(entryPath, content);

  return entryPath;
}
