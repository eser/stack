// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Module Graph Analyzer
 * Scans the codebase to identify "use client" directives and build a client component registry
 *
 * Uses @eser/codebase/directive-analysis for the core analysis,
 * adding caching support for incremental builds.
 */

import {
  analyzeClientComponents as analyzeClientComponentsBase,
  type DirectiveAnalysisOptions,
  type DirectiveMatch,
} from "@eser/codebase/directive-analysis";
import { runtime } from "@eser/standards/runtime";
import * as logging from "@eser/logging";
import { walkFiles } from "@eser/collector";
import type { BuildCache } from "../../domain/build-cache.ts";

const analyzeLogger = logging.logger.getLogger([
  "laroux-bundler",
  "rsc-analyze",
]);

// Re-export types for backward compatibility
export type { DirectiveAnalysisOptions, DirectiveMatch };

export type ClientComponent = {
  /** Absolute file path */
  filePath: string;
  /** Relative path from project root (ES Module path) */
  relativePath: string;
  /** Export names (default or named) */
  exportNames: string[];
};

/**
 * Convert DirectiveMatch to ClientComponent for backward compatibility
 */
function toClientComponent(match: DirectiveMatch): ClientComponent {
  return {
    filePath: match.filePath,
    relativePath: match.relativePath,
    exportNames: [...match.exports],
  };
}

/**
 * Analyze the codebase and identify all client components
 * @param srcDir - Source directory to scan
 * @param projectRoot - Project root for relative path calculation
 * @param cache - Optional build cache for incremental analysis
 */
export async function analyzeClientComponents(
  srcDir: string,
  projectRoot: string,
  cache?: BuildCache,
): Promise<ClientComponent[]> {
  analyzeLogger.debug(`🔍 Analyzing client components in: ${srcDir}`);

  // If no cache, use the base implementation directly
  if (!cache) {
    const matches = await analyzeClientComponentsBase(srcDir, {
      projectRoot,
    });

    const components = matches.map(toClientComponent);

    analyzeLogger.debug(
      `📊 Total client components found: ${components.length}`,
    );

    return components;
  }

  // With cache - we need to do incremental analysis
  // Use the base implementation but check cache for each file
  const clientComponents: ClientComponent[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  // Get all matches from base implementation (it walks files internally)
  const matches = await analyzeClientComponentsBase(srcDir, {
    projectRoot,
  });

  for (const match of matches) {
    // Get file modification time for cache check
    let fileMtime = 0;
    try {
      const fileStat = await runtime.fs.stat(match.filePath);
      fileMtime = fileStat.mtime?.getTime() ?? 0;
    } catch {
      // File might have been deleted, skip
      continue;
    }

    // Check cache
    const cached = cache.getClientComponent(match.filePath, fileMtime);
    if (cached) {
      cacheHits++;
      if (cached.isClient) {
        clientComponents.push({
          filePath: match.filePath,
          relativePath: match.relativePath,
          exportNames: cached.exportNames,
        });
      }
      continue;
    }

    // Cache miss - the match already confirmed it's a client component
    cacheMisses++;
    const exportNames = [...match.exports];
    cache.setClientComponent(match.filePath, true, exportNames, fileMtime);

    clientComponents.push({
      filePath: match.filePath,
      relativePath: match.relativePath,
      exportNames,
    });

    analyzeLogger.debug(
      `  ✓ Found client component: ${match.relativePath} (exports: ${
        exportNames.join(", ")
      })`,
    );
  }

  if (cacheHits > 0 || cacheMisses > 0) {
    analyzeLogger.debug(
      `📊 Component analysis: ${cacheHits} cache hits, ${cacheMisses} analyzed`,
    );
  }

  analyzeLogger.debug(
    `📊 Total client components found: ${clientComponents.length}`,
  );

  return clientComponents;
}

/**
 * Get all component files (both server and client)
 */
export async function getAllComponents(srcDir: string): Promise<string[]> {
  const components: string[] = [];
  const IGNORE_PATTERN = /(?:node_modules|\.test\.|\.spec\.)/;

  for await (
    const relPath of walkFiles(srcDir, "**/*.{tsx,ts,jsx,js}", IGNORE_PATTERN)
  ) {
    components.push(runtime.path.join(srcDir, relPath));
  }

  return components;
}

// CLI usage
if (import.meta.main) {
  const projectRoot = runtime.process.cwd();
  const srcDir = runtime.path.resolve(projectRoot, "src");
  const clientComponents = await analyzeClientComponents(srcDir, projectRoot);

  analyzeLogger.info("Client Components:", { clientComponents });
}
