// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Module Graph Analyzer
 * Scans the codebase to identify "use client" directives and build a client component registry
 *
 * Uses @eserstack/codebase/directive-analysis for the core analysis,
 * adding caching support for incremental builds.
 */

import * as directiveAnalysis from "@eserstack/codebase/directive-analysis";
import type {
  DirectiveAnalysisOptions,
  DirectiveMatch,
} from "@eserstack/codebase/directive-analysis";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as patterns from "@eserstack/standards/patterns";
import * as logging from "@eserstack/logging";
import * as collector from "@eserstack/collector";
import type { ClientComponentCache } from "../../domain/build-cache.ts";

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
  cache?: ClientComponentCache,
): Promise<ClientComponent[]> {
  analyzeLogger.debug(`🔍 Analyzing client components in: ${srcDir}`);

  // If no cache, use the base implementation directly
  if (cache === undefined) {
    const matches = await directiveAnalysis.analyzeClientComponents(srcDir, {
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
  const matches = await directiveAnalysis.analyzeClientComponents(srcDir, {
    projectRoot,
  });

  // Modification times for the cache check; null marks a file that was
  // deleted after the scan
  const modifiedTimes = await Promise.all(
    matches.map(async (match) => {
      try {
        const fileStat = await runtime.fs.stat(match.filePath);
        return fileStat.mtime?.getTime() ?? 0;
      } catch {
        return null;
      }
    }),
  );

  for (const [index, match] of matches.entries()) {
    const fileMtime = modifiedTimes[index] ?? null;
    if (fileMtime === null) {
      continue;
    }

    // Check cache
    const cached = cache.getClientComponent(match.filePath, fileMtime);
    if (cached !== null) {
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
      `  ✓ Found client component: ${match.relativePath} (exports: ${exportNames.join(
        ", ",
      )})`,
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

/** Extensions of the files {@link getAllComponents} returns. */
const COMPONENT_EXTENSIONS: readonly string[] = ["tsx", "ts", "jsx", "js"];

/**
 * Get all component files (both server and client)
 */
export async function getAllComponents(srcDir: string): Promise<string[]> {
  const components: string[] = [];
  const IGNORE_PATTERN = /(?:node_modules|\.test\.|\.spec\.)/;

  // The extension check is done here: the glob filter of walkFiles supports
  // only * and **, so a "*.{tsx,ts}" list would match no file.
  for await (const relPath of collector.walkFiles(
    srcDir,
    undefined,
    IGNORE_PATTERN,
  )) {
    if (patterns.hasExtension(relPath, COMPONENT_EXTENSIONS)) {
      components.push(runtime.path.join(srcDir, relPath));
    }
  }

  return components;
}
