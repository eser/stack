// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Import Rewriting for Server Components
 * Automatically rewrites imports in server components to point to transformed client components
 */

import { runtime } from "@eser/standards/runtime";
import { walkFiles } from "@eser/collector";
import type { TransformResult } from "./rsc-transform.ts";
import * as logging from "@eser/logging";

const rewriteLogger = logging.logger.getLogger([
  "laroux-bundler",
  "rsc-rewrite-imports",
]);

export type ImportRewriteResult = {
  originalPath: string;
  rewrittenPath: string;
  importsRewritten: number;
};

/**
 * Check if a position in the content is inside a string literal
 */
function isInsideStringLiteral(content: string, position: number): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let prevChar = "";

  for (let i = 0; i < position; i++) {
    const char = content[i];

    // Skip escaped quotes
    if (prevChar === "\\") {
      prevChar = char;
      continue;
    }

    if (char === "'" && !inDoubleQuote && !inTemplateString) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && !inTemplateString) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "`" && !inSingleQuote && !inDoubleQuote) {
      inTemplateString = !inTemplateString;
    }

    prevChar = char;
  }

  return inSingleQuote || inDoubleQuote || inTemplateString;
}

/**
 * Parse imports from TypeScript/JSX file
 * Matches: import Foo from "./Foo.tsx"
 *          import { Bar } from "../Bar.tsx"
 */
function parseImports(
  content: string,
): Array<
  { original: string; path: string; startIndex: number; endIndex: number }
> {
  const imports: Array<
    { original: string; path: string; startIndex: number; endIndex: number }
  > = [];

  // Match import statements with various patterns
  const importRegex =
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?["']([^"']+)["'];?/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];

    // Skip if no import path captured
    if (!importPath) {
      continue;
    }

    // Skip if this import is inside a string literal (e.g., code samples)
    if (isInsideStringLiteral(content, match.index)) {
      continue;
    }

    // Process relative imports AND @/ path alias imports
    if (
      importPath.startsWith("./") || importPath.startsWith("../") ||
      importPath.startsWith("@/")
    ) {
      imports.push({
        original: match[0],
        path: importPath,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  return imports;
}

/**
 * Resolve an import path relative to the importing file
 * Handles both relative imports (./,../) and @/ path alias
 */
function resolveImportPath(
  importerPath: string,
  importPath: string,
  projectRoot: string,
): string {
  // Handle @/ path alias (resolves to src/)
  if (importPath.startsWith("@/")) {
    const pathWithoutAlias = importPath.slice(2); // Remove "@/"
    return runtime.path.join(projectRoot, "src", pathWithoutAlias);
  }

  // Handle relative imports
  const importerDir = runtime.path.dirname(importerPath);
  const resolved = runtime.path.resolve(importerDir, importPath);
  return resolved;
}

/**
 * Check if a resolved path matches a client component
 */
function findClientComponentMatch(
  resolvedPath: string,
  clientComponentMap: Map<string, string>,
): string | null {
  // Try exact match first
  if (clientComponentMap.has(resolvedPath)) {
    return clientComponentMap.get(resolvedPath)!;
  }

  // Try with common extensions
  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  for (const ext of extensions) {
    const withExt = resolvedPath.endsWith(ext)
      ? resolvedPath
      : resolvedPath + ext;
    if (clientComponentMap.has(withExt)) {
      return clientComponentMap.get(withExt)!;
    }
  }

  return null;
}

/**
 * Check if a resolved path matches a CSS module
 */
function findCSSModuleMatch(
  resolvedPath: string,
  cssModuleMap: Map<string, string>,
): string | null {
  // CSS modules must have exact .module.css extension
  if (cssModuleMap.has(resolvedPath)) {
    return cssModuleMap.get(resolvedPath)!;
  }

  // Try adding .module.css if not present
  if (!resolvedPath.endsWith(".module.css")) {
    const withExt = resolvedPath + ".module.css";
    if (cssModuleMap.has(withExt)) {
      return cssModuleMap.get(withExt)!;
    }
  }

  return null;
}

/**
 * Rewrite imports in a server component file
 */
export async function rewriteServerComponentImports(
  serverComponentPath: string,
  clientComponentMap: Map<string, string>,
  cssModuleMap: Map<string, string>,
  outputDir: string,
  projectRoot: string,
): Promise<ImportRewriteResult> {
  const content = await runtime.fs.readTextFile(serverComponentPath);
  const imports = parseImports(content);

  let rewrittenContent = content;
  let importsRewritten = 0;
  let offset = 0; // Track content length changes

  for (const importInfo of imports) {
    // Resolve the import path
    const resolvedPath = resolveImportPath(
      serverComponentPath,
      importInfo.path,
      projectRoot,
    );

    // Check if this import references a CSS module
    const cssModulePath = findCSSModuleMatch(resolvedPath, cssModuleMap);
    if (cssModulePath) {
      // Rewrite CSS module import to JSON import with type assertion
      // e.g., import "./file.module.css" -> import styles from "./file.module.css.json" with { type: "json" }
      const newImportPath = importInfo.path.endsWith(".module.css")
        ? `${importInfo.path}.json`
        : `${importInfo.path}.module.css.json`;

      // Detect if this is a side-effect import (no bindings)
      const isSideEffectImport = importInfo.original.match(
        /^import\s+["']/,
      );

      let newImport: string;
      if (isSideEffectImport) {
        // Side-effect import: import "./file.module.css"
        // Convert to: import styles from "./file.module.css.json" with { type: "json" }
        // We need a binding to use the assertion syntax
        newImport = importInfo.original.replace(
          /^import\s+["']([^"']+)["'];?/,
          `import styles from "${newImportPath}" with { type: "json" };`,
        );
      } else {
        // Named or default import: import styles from "./file.module.css"
        // Add assertion: import styles from "./file.module.css.json" with { type: "json" }
        newImport = importInfo.original
          .replace(
            `"${importInfo.path}"`,
            `"${newImportPath}" with { type: "json" }`,
          )
          .replace(
            `'${importInfo.path}'`,
            `'${newImportPath}' with { type: "json" }`,
          );
      }

      const startIndex = importInfo.startIndex + offset;
      const endIndex = importInfo.endIndex + offset;

      rewrittenContent = rewrittenContent.slice(0, startIndex) +
        newImport +
        rewrittenContent.slice(endIndex);

      offset += newImport.length - importInfo.original.length;
      importsRewritten++;
      continue; // Skip client component check for this import
    }

    // Check if this import references a client component
    const transformedPath = findClientComponentMatch(
      resolvedPath,
      clientComponentMap,
    );

    if (transformedPath) {
      // Calculate output path for this server component
      const relativeToRoot = runtime.path.relative(
        projectRoot,
        serverComponentPath,
      );
      const outputPath = runtime.path.join(outputDir, relativeToRoot);

      // Calculate relative path from the OUTPUT location to transformed component
      const relativePath = runtime.path.relative(
        runtime.path.dirname(outputPath),
        transformedPath,
      );

      // Ensure it starts with ./ or ../
      const normalizedPath = relativePath.startsWith(".")
        ? relativePath
        : `./${relativePath}`;

      // Replace the import path in the content
      const newImport = importInfo.original.replace(
        `"${importInfo.path}"`,
        `"${normalizedPath}"`,
      ).replace(
        `'${importInfo.path}'`,
        `'${normalizedPath}'`,
      );

      const startIndex = importInfo.startIndex + offset;
      const endIndex = importInfo.endIndex + offset;

      rewrittenContent = rewrittenContent.slice(0, startIndex) +
        newImport +
        rewrittenContent.slice(endIndex);

      offset += newImport.length - importInfo.original.length;
      importsRewritten++;
    } else if (importInfo.path.startsWith("@/")) {
      // Rewrite @/ path alias to relative path (for non-client-component imports)
      // e.g., @/lib/backend/backend.ts -> ../../../lib/backend/backend.ts
      const relativeToRoot = runtime.path.relative(
        projectRoot,
        serverComponentPath,
      );
      const outputPath = runtime.path.join(outputDir, relativeToRoot);

      // Convert @/ to src/ and resolve the target path
      const targetPath = runtime.path.join(
        projectRoot,
        "dist",
        "server",
        "src",
        importInfo.path.slice(2), // Remove "@/"
      );

      // Calculate relative path from current file to target
      const relativePath = runtime.path.relative(
        runtime.path.dirname(outputPath),
        targetPath,
      );

      // Ensure it starts with ./ or ../
      const normalizedPath = relativePath.startsWith(".")
        ? relativePath
        : `./${relativePath}`;

      // Replace the import path
      const newImport = importInfo.original.replace(
        `"${importInfo.path}"`,
        `"${normalizedPath}"`,
      ).replace(
        `'${importInfo.path}'`,
        `'${normalizedPath}'`,
      );

      const startIndex = importInfo.startIndex + offset;
      const endIndex = importInfo.endIndex + offset;

      rewrittenContent = rewrittenContent.slice(0, startIndex) +
        newImport +
        rewrittenContent.slice(endIndex);

      offset += newImport.length - importInfo.original.length;
      importsRewritten++;
    }
  }

  // Write the rewritten file to dist/server
  const relativeToRoot = runtime.path.relative(
    projectRoot,
    serverComponentPath,
  );
  const outputPath = runtime.path.join(outputDir, relativeToRoot);

  await runtime.fs.ensureDir(runtime.path.dirname(outputPath));
  await runtime.fs.writeTextFile(outputPath, rewrittenContent);

  return {
    originalPath: serverComponentPath,
    rewrittenPath: outputPath,
    importsRewritten,
  };
}

/**
 * Create a map of client component paths to their transformed paths
 */
export function createClientComponentMap(
  transformResults: TransformResult[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const result of transformResults) {
    // Map absolute path
    map.set(result.originalPath, result.transformedPath);

    // Also map without extension for convenience
    const withoutExt = result.originalPath.replace(/\.(tsx|ts|jsx|js)$/, "");
    map.set(withoutExt, result.transformedPath);
  }

  return map;
}

/**
 * Create a map of CSS module paths to their JSON output paths
 */
export function createCSSModuleMap(
  cssModulePaths: string[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const cssPath of cssModulePaths) {
    // Map absolute path to JSON output path
    const jsonPath = cssPath.replace(/\.module\.css$/, ".module.css.json");
    map.set(cssPath, jsonPath);

    // Also map without extension for convenience
    const withoutExt = cssPath.replace(/\.module\.css$/, "");
    map.set(withoutExt, jsonPath);
  }

  return map;
}

/**
 * Process all server components
 */
export async function rewriteAllServerComponents(
  serverComponentPaths: string[],
  transformResults: TransformResult[],
  cssModulePaths: string[],
  outputDir: string,
  projectRoot: string,
): Promise<ImportRewriteResult[]> {
  rewriteLogger.debug(
    `🔄 Rewriting imports in ${serverComponentPaths.length} server component(s)...`,
  );

  const clientComponentMap = createClientComponentMap(transformResults);
  const cssModuleMap = createCSSModuleMap(cssModulePaths);

  rewriteLogger.debug(
    `   Found ${cssModulePaths.length} CSS module(s) to track`,
  );

  const results: ImportRewriteResult[] = [];

  for (const componentPath of serverComponentPaths) {
    const result = await rewriteServerComponentImports(
      componentPath,
      clientComponentMap,
      cssModuleMap,
      outputDir,
      projectRoot,
    );

    if (result.importsRewritten > 0) {
      rewriteLogger.debug(
        `  ✓ ${
          runtime.path.relative(projectRoot, componentPath)
        } (${result.importsRewritten} import(s) rewritten)`,
      );
    } else {
      rewriteLogger.debug(
        `  ✓ ${
          runtime.path.relative(projectRoot, componentPath)
        } (no client imports)`,
      );
    }

    results.push(result);
  }

  rewriteLogger.debug(`✅ Import rewriting complete`);

  return results;
}

/**
 * Rewrite CSS module imports in a single client component
 */
async function rewriteClientComponentCSSImports(
  clientComponentPath: string,
  cssModuleMap: Map<string, string>,
  projectRoot: string,
): Promise<{ importsRewritten: number }> {
  const content = await runtime.fs.readTextFile(clientComponentPath);
  const imports = parseImports(content);

  let rewrittenContent = content;
  let importsRewritten = 0;
  let offset = 0;

  for (const importInfo of imports) {
    // Resolve the import path
    const resolvedPath = resolveImportPath(
      clientComponentPath,
      importInfo.path,
      projectRoot,
    );

    // Check if this import references a CSS module
    const cssModulePath = findCSSModuleMatch(resolvedPath, cssModuleMap);
    if (cssModulePath) {
      // Rewrite CSS module import to JSON import with type assertion
      const newImportPath = importInfo.path.endsWith(".module.css")
        ? `${importInfo.path}.json`
        : `${importInfo.path}.module.css.json`;

      // Detect if this is a side-effect import (no bindings)
      const isSideEffectImport = importInfo.original.match(
        /^import\s+["']/,
      );

      let newImport: string;
      if (isSideEffectImport) {
        // Side-effect import: import "./file.module.css"
        // Convert to: import styles from "./file.module.css.json" with { type: "json" }
        newImport = importInfo.original.replace(
          /^import\s+["']([^"']+)["'];?/,
          `import styles from "${newImportPath}" with { type: "json" };`,
        );
      } else {
        // Named or default import: import styles from "./file.module.css"
        // Add assertion: import styles from "./file.module.css.json" with { type: "json" }
        newImport = importInfo.original
          .replace(
            `"${importInfo.path}"`,
            `"${newImportPath}" with { type: "json" }`,
          )
          .replace(
            `'${importInfo.path}'`,
            `'${newImportPath}' with { type: "json" }`,
          );
      }

      const startIndex = importInfo.startIndex + offset;
      const endIndex = importInfo.endIndex + offset;

      rewrittenContent = rewrittenContent.slice(0, startIndex) +
        newImport +
        rewrittenContent.slice(endIndex);

      offset += newImport.length - importInfo.original.length;
      importsRewritten++;
    }
  }

  // Write back the rewritten content if changes were made
  if (importsRewritten > 0) {
    await runtime.fs.writeTextFile(clientComponentPath, rewrittenContent);
  }

  return { importsRewritten };
}

/**
 * Process all client components to rewrite CSS module imports
 */
export async function rewriteAllClientComponentCSSImports(
  clientComponents: Array<{ filePath: string }>,
  cssModulePaths: string[],
  _outputDir: string,
  projectRoot: string,
): Promise<void> {
  rewriteLogger.debug(
    `🔄 Rewriting CSS module imports in ${clientComponents.length} client component(s)...`,
  );

  const cssModuleMap = createCSSModuleMap(cssModulePaths);

  rewriteLogger.debug(
    `   Found ${cssModulePaths.length} CSS module(s) to track`,
  );

  let totalRewritten = 0;

  for (const component of clientComponents) {
    const result = await rewriteClientComponentCSSImports(
      component.filePath,
      cssModuleMap,
      projectRoot,
    );

    if (result.importsRewritten > 0) {
      rewriteLogger.debug(
        `  ✓ ${
          runtime.path.relative(projectRoot, component.filePath)
        } (${result.importsRewritten} CSS import(s) rewritten)`,
      );
      totalRewritten += result.importsRewritten;
    }
  }

  if (totalRewritten > 0) {
    rewriteLogger.debug(
      `✅ Rewrote ${totalRewritten} CSS module import(s) in ${clientComponents.length} client component(s)`,
    );
  } else {
    rewriteLogger.debug(`✅ No CSS module imports found in client components`);
  }
}

/**
 * Rewrite CSS module imports in ALL source files that might be bundled
 * This is necessary because client components may import server components
 * that have CSS module imports, and Deno.bundle() doesn't understand CSS imports
 */
export async function rewriteAllSrcCSSModuleImports(
  srcDir: string,
  cssModulePaths: string[],
  projectRoot: string,
): Promise<void> {
  rewriteLogger.debug(
    `🔄 Rewriting CSS module imports in all src files...`,
  );

  const cssModuleMap = createCSSModuleMap(cssModulePaths);

  // Find all .tsx and .ts files in src directory
  const srcFiles: string[] = [];
  for await (
    const relPath of walkFiles(srcDir, "**/*.{tsx,ts}", /node_modules/)
  ) {
    srcFiles.push(runtime.path.join(srcDir, relPath));
  }

  rewriteLogger.debug(
    `   Found ${srcFiles.length} source file(s) to check`,
  );

  let totalRewritten = 0;

  for (const filePath of srcFiles) {
    const result = await rewriteClientComponentCSSImports(
      filePath,
      cssModuleMap,
      projectRoot,
    );

    if (result.importsRewritten > 0) {
      rewriteLogger.debug(
        `  ✓ ${
          runtime.path.relative(projectRoot, filePath)
        } (${result.importsRewritten} CSS import(s) rewritten)`,
      );
      totalRewritten += result.importsRewritten;
    }
  }

  if (totalRewritten > 0) {
    rewriteLogger.debug(
      `✅ Rewrote ${totalRewritten} CSS module import(s) in ${srcFiles.length} source file(s)`,
    );
  } else {
    rewriteLogger.debug(`✅ No CSS module imports needed rewriting`);
  }
}
