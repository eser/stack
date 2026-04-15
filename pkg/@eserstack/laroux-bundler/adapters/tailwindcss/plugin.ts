// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tailwind CSS Plugin for Laroux Bundler
 * Uses @tailwindcss/node programmatic API + @tailwindcss/oxide for scanning
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";
import { walkFiles } from "@eserstack/collector";
import { Scanner } from "@tailwindcss/oxide";
import type {
  CriticalCssResult,
  CssPlugin,
  CssPluginContext,
  CssPluginOptions,
  UniversalCssResult,
} from "../../domain/css-plugin.ts";
import { compileTailwind, expandApplyDirectives } from "./compile.ts";
import { extractCriticalPageCss } from "./critical-page-css.ts";
import { extractCriticalUniversalCss } from "./critical-universal-css.ts";

const logger = logging.logger.getLogger([
  "laroux-bundler",
  "tailwindcss",
]);

export type TailwindPluginOptions = CssPluginOptions & {
  /** Custom patterns to detect Tailwind usage */
  detectPatterns?: RegExp[];
};

/**
 * Create a Tailwind CSS plugin
 * Uses @tailwindcss/node programmatic API + @tailwindcss/oxide for scanning
 * @param options - Plugin options
 * @returns CssPlugin instance
 */
export function createTailwindPlugin(
  options: TailwindPluginOptions = {},
): CssPlugin {
  const {
    globalCssPath = "src/app/styles/global.css",
    autoInjectReference = true,
    detectPatterns = [/@tailwind\b/, /@apply\b/, /@import\s+["']tailwindcss/],
  } = options;

  return {
    name: "tailwindcss",

    shouldProcess(css: string, _context: CssPluginContext): boolean {
      // Check if CSS contains Tailwind-specific directives
      return detectPatterns.some((pattern) => pattern.test(css));
    },

    preprocess(
      css: string,
      context: CssPluginContext,
    ): Promise<string> | string {
      // For CSS modules, handle @apply expansion
      if (context.isModule && css.includes("@apply")) {
        let processedContent = css;

        // Auto-inject @reference directive if enabled and not present
        const hasReferenceDirective = /^@reference\s+/m.test(css);
        if (autoInjectReference && !hasReferenceDirective) {
          // Calculate relative path from CSS module to global.css
          const cssDir = runtime.path.dirname(context.cssPath);
          const globalCssAbsPath = runtime.path.resolve(
            context.projectRoot,
            globalCssPath,
          );
          const relativePath = runtime.path.relative(cssDir, globalCssAbsPath);

          processedContent = `@reference "${relativePath}";\n\n${css}`;
        }

        // Expand @apply directives
        return expandApplyDirectives(
          processedContent,
          runtime.path.dirname(context.cssPath),
        );
      }

      return css;
    },

    async compile(
      css: string,
      context: CssPluginContext,
    ): Promise<string> {
      const cssDir = runtime.path.dirname(context.cssPath);
      const srcDir = runtime.path.resolve(context.projectRoot, "src");

      // Collect source files for scanning
      const filesToScan: Array<{ content: string; extension: string }> = [];

      // Walk src directory using @eserstack/collector walkFiles
      for await (
        const relPath of walkFiles(
          srcDir,
          "**/*.{tsx,ts,jsx,js}",
          /node_modules/,
        )
      ) {
        const fullPath = runtime.path.resolve(srcDir, relPath);
        const ext = runtime.path.extname(relPath);
        const content = await runtime.fs.readTextFile(fullPath);
        filesToScan.push({
          content,
          extension: ext.slice(1), // Remove leading dot
        });
      }

      // Scan all files for utility candidates using @tailwindcss/oxide
      const scanner = new Scanner({});
      const candidates = scanner.scanFiles(filesToScan);

      logger.debug(
        `Scanned ${filesToScan.length} files, found ${
          Array.isArray(candidates) ? candidates.length : 0
        } candidates`,
      );

      // Compile with programmatic API
      return compileTailwind(css, {
        base: cssDir,
        candidates,
      });
    },

    extractCriticalCss(
      compiledCss: string,
      html: string,
      options?: {
        forceInclude?: (string | RegExp)[];
        forceExclude?: (string | RegExp)[];
      },
    ): CriticalCssResult {
      const result = extractCriticalPageCss({
        css: compiledCss,
        html,
        forceInclude: options?.forceInclude,
        forceExclude: options?.forceExclude,
      });

      return {
        critical: result.critical,
        deferred: result.deferred,
        stats: {
          originalSize: result.stats.originalSize,
          criticalSize: result.stats.criticalSize,
          deferredSize: result.stats.deferredSize,
        },
      };
    },

    extractUniversalCss(compiledCss: string): UniversalCssResult {
      const result = extractCriticalUniversalCss(compiledCss);

      return {
        css: result.css,
        themeVariables: result.themeVariables,
      };
    },
  };
}
