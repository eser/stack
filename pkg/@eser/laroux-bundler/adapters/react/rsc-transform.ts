// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Client Component Transformation
 * Transforms "use client" components into createClientReference() wrappers at build time
 */

import { runtime } from "@eser/standards/runtime";
import type { ClientComponent } from "./rsc-analyze.ts";
import * as logging from "@eser/logging";

const transformLogger = logging.logger.getLogger([
  "laroux-bundler",
  "rsc-transform",
]);

export type TransformResult = {
  originalPath: string;
  transformedPath: string;
};

/**
 * Transform a single client component file
 */
export async function transformClientComponent(
  component: ClientComponent,
  outputDir: string,
): Promise<TransformResult> {
  // Create output directory structure
  const relativeDirPath = runtime.path.dirname(component.relativePath);
  const outputSubDir = runtime.path.join(outputDir, relativeDirPath);
  await runtime.fs.ensureDir(outputSubDir);

  // Generate transformed content
  const transformed = generateTransformedContent(component);

  // Write transformed file
  const outputFileName = component.relativePath.split("/").pop()!;
  const transformedPath = runtime.path.join(outputSubDir, outputFileName);
  await runtime.fs.writeTextFile(transformedPath, transformed);

  return {
    originalPath: component.filePath,
    transformedPath,
  };
}

/**
 * Generate the transformed content that wraps the component in createClientReference
 */
function generateTransformedContent(component: ClientComponent): string {
  // Generate export statements for all exports
  const exportStatements = component.exportNames.map((exportName) => {
    const isDefaultExport = exportName === "default";
    return isDefaultExport
      ? `export default createClientReference(\n  "./${component.relativePath}",\n  "default"\n);`
      : `export const ${exportName} = createClientReference(\n  "./${component.relativePath}",\n  "${exportName}"\n);`;
  });

  return `/**
 * Auto-generated client component reference
 * Original: ${component.relativePath}
 * Exports: ${component.exportNames.join(", ")}
 * This file is generated at build time - do not edit!
 */

import { createClientReference } from "@eser/laroux-react/protocol";

// Export client components as references
// The actual component code runs in the browser
${exportStatements.join("\n\n")}
`;
}

/**
 * Transform all client components
 */
export async function transformAllClientComponents(
  components: ClientComponent[],
  outputDir: string,
  projectRoot: string,
): Promise<TransformResult[]> {
  transformLogger.debug(
    `🔄 Transforming ${components.length} client component(s)...`,
  );

  const results: TransformResult[] = [];

  for (const component of components) {
    const result = await transformClientComponent(component, outputDir);
    transformLogger.debug(
      `  ✓ ${component.relativePath} → ${
        runtime.path.relative(projectRoot, result.transformedPath)
      }`,
    );
    results.push(result);
  }

  transformLogger.debug(`✅ Transformation complete`);

  return results;
}

/**
 * Create import mapping for server code
 * Maps original ES Module paths to transformed versions
 */
export function createImportMapping(
  transformResults: TransformResult[],
): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const result of transformResults) {
    // Map full paths with ./ prefix
    mapping.set(`./${result.originalPath}`, result.transformedPath);

    // Also handle different path variations (filename only)
    const fileName = result.originalPath.split("/").pop()!;
    mapping.set(`./${fileName}`, result.transformedPath);
  }

  return mapping;
}

/**
 * Generate a manifest of transformed components for debugging
 */
export async function generateTransformManifest(
  transformResults: TransformResult[],
  outputPath: string,
  projectRoot: string,
): Promise<void> {
  const manifest = {
    generated: new Date().toISOString(),
    components: transformResults.map((r) => ({
      original: r.originalPath,
      transformed: runtime.path.relative(projectRoot, r.transformedPath),
    })),
  };

  await runtime.fs.writeTextFile(outputPath, JSON.stringify(manifest, null, 2));
  transformLogger.debug(
    `📝 Transform manifest saved to: ${
      runtime.path.relative(projectRoot, outputPath)
    }`,
  );
}
