// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tailwind CSS plugin for @eser/bundler.
 *
 * Follows the same architecture as @tailwindcss/vite:
 * - Uses compile() from @tailwindcss/node for CSS compilation
 * - Uses Scanner from @tailwindcss/oxide for candidate detection
 * - Handles @apply, @tailwind, @theme directives
 * - Reuses compiler instance across files for performance
 *
 * @module
 *
 * @example
 * ```ts
 * import { createTailwindRoot } from "@eser/bundler/css/tailwind-plugin";
 * import { processCssModule } from "@eser/bundler/css/modules";
 *
 * // 1. Create Tailwind compiler root (reused across files)
 * const tailwind = createTailwindRoot({
 *   base: ".",
 *   minify: true,
 * });
 *
 * try {
 *   // 2. Process CSS modules with @apply support
 *   const buttonModule = await processCssModule("src/components/Button.module.css", {
 *     tailwind,
 *     generateDts: true,
 *   });
 * } finally {
 *   // 3. Cleanup when done
 *   tailwind.dispose();
 * }
 * ```
 */

import * as posix from "@std/path/posix";

// Lazily loaded Tailwind dependencies
let tailwindNode: typeof import("npm:@tailwindcss/node@4") | null = null;
let tailwindOxide: typeof import("npm:@tailwindcss/oxide@4") | null = null;

/**
 * Tailwind feature flags from @tailwindcss/node.
 * Used to detect which Tailwind features a CSS file uses.
 */
export const TailwindFeatures = {
  None: 0,
  AtApply: 1 << 0,
  ThemeFunction: 1 << 1,
  Utilities: 1 << 2,
  JsPluginCompat: 1 << 3,
} as const;

/**
 * Options for creating a Tailwind compiler root.
 */
export interface TailwindPluginOptions {
  /** Project root directory for source scanning. */
  readonly base: string;
  /** Enable source maps. */
  readonly sourceMaps?: boolean;
  /** Minify output. */
  readonly minify?: boolean;
  /**
   * Auto-inject `@reference "tailwindcss"` when @apply is detected but no reference exists.
   * This makes CSS modules with @apply work without manually adding the reference directive.
   * @default true
   */
  readonly autoInjectReference?: boolean;
}

/**
 * Tailwind compiler root interface.
 * Reuse this instance across multiple CSS files for optimal performance.
 */
export interface TailwindRoot {
  /** Compile CSS content with Tailwind. Returns null if no Tailwind features detected. */
  compile(content: string, id: string): Promise<TailwindCompileResult | null>;
  /** Dispose resources and clear caches. */
  dispose(): void;
}

/**
 * Result of Tailwind CSS compilation.
 */
export interface TailwindCompileResult {
  /** Compiled CSS with @apply and @tailwind directives expanded. */
  readonly code: string;
  /** Source map (if sourceMaps enabled). */
  readonly map?: string;
  /** Files that should trigger recompilation when changed. */
  readonly dependencies: readonly string[];
}

// Internal type aliases for Tailwind compiler
type TailwindCompiler = Awaited<
  ReturnType<typeof import("npm:@tailwindcss/node@4").compile>
>;
type TailwindScanner = InstanceType<
  typeof import("npm:@tailwindcss/oxide@4").Scanner
>;

/**
 * Load Tailwind dependencies lazily.
 * This allows the bundler to work without Tailwind if not needed.
 */
async function loadTailwindDeps(): Promise<{
  node: typeof import("npm:@tailwindcss/node@4");
  oxide: typeof import("npm:@tailwindcss/oxide@4");
}> {
  if (tailwindNode === null || tailwindOxide === null) {
    const [node, oxide] = await Promise.all([
      import("npm:@tailwindcss/node@4"),
      import("npm:@tailwindcss/oxide@4"),
    ]);
    tailwindNode = node;
    tailwindOxide = oxide;
  }
  return { node: tailwindNode, oxide: tailwindOxide };
}

/**
 * Track build dependency modification times.
 */
async function addBuildDependency(
  deps: Map<string, number | null>,
  path: string,
): Promise<void> {
  try {
    const stat = await Deno.stat(path);
    deps.set(path, stat.mtime?.getTime() ?? null);
  } catch {
    deps.set(path, null);
  }
}

/**
 * Check if any build dependencies have changed.
 */
async function requiresRebuild(
  deps: Map<string, number | null>,
): Promise<boolean> {
  for (const [path, mtime] of deps) {
    if (mtime === null) {
      return true;
    }
    try {
      const stat = await Deno.stat(path);
      if ((stat.mtime?.getTime() ?? 0) > mtime) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Check if CSS needs @reference injection.
 *
 * Returns true if:
 * - Contains @apply directive
 * - Does NOT already have @reference or @import "tailwindcss"
 *
 * @param content - CSS content to check
 * @returns true if @reference "tailwindcss" should be injected
 */
function needsReferenceInjection(content: string): boolean {
  // Only inject if @apply is present
  if (!content.includes("@apply")) {
    return false;
  }

  // Already has @reference directive
  if (/@reference\s+["']/.test(content)) {
    return false;
  }

  // Already imports tailwindcss
  if (/@import\s+["']tailwindcss["']/.test(content)) {
    return false;
  }

  return true;
}

/**
 * Create a Tailwind compiler root.
 *
 * The root manages compiler state and caches across multiple CSS files.
 * Follow the same pattern as @tailwindcss/vite for optimal performance.
 *
 * @param options - Plugin configuration options
 * @returns TailwindRoot instance for compiling CSS
 *
 * @example
 * ```ts
 * const tailwind = createTailwindRoot({ base: "." });
 *
 * // Compile a CSS file with Tailwind
 * const result = await tailwind.compile(cssContent, "src/styles.css");
 * if (result) {
 *   console.log(result.code);
 * }
 *
 * tailwind.dispose();
 * ```
 */
export function createTailwindRoot(
  options: TailwindPluginOptions,
): TailwindRoot {
  const {
    base,
    sourceMaps = false,
    minify = false,
    autoInjectReference = true,
  } = options;

  // State for compiler reuse (like @tailwindcss/vite)
  let compiler: TailwindCompiler | null = null;
  let scanner: TailwindScanner | null = null;
  const candidates = new Set<string>();
  const buildDependencies = new Map<string, number | null>();

  return {
    async compile(
      content: string,
      id: string,
    ): Promise<TailwindCompileResult | null> {
      const { node, oxide } = await loadTailwindDeps();

      // Preprocess: auto-inject @reference if needed
      let processedContent = content;
      if (autoInjectReference && needsReferenceInjection(content)) {
        processedContent = `@reference "tailwindcss";\n\n${content}`;
      }

      const inputBase = posix.dirname(posix.resolve(id));
      const dependencies: string[] = [];

      // Initialize or reinitialize compiler if dependencies changed
      const needsRebuild = await requiresRebuild(buildDependencies);

      if (compiler === null || scanner === null || needsRebuild) {
        buildDependencies.clear();

        // Compile CSS to get compiler instance (following @tailwindcss/vite pattern)
        compiler = await node.compile(processedContent, {
          from: sourceMaps ? id : undefined,
          base: inputBase,
          shouldRewriteUrls: true,
          onDependency: (depPath: string) => {
            dependencies.push(depPath);
            addBuildDependency(buildDependencies, depPath);
          },
        });

        // Setup scanner based on compiler's source configuration
        // This follows the exact pattern from @tailwindcss/vite
        type SourceEntry = { base: string; pattern: string; negated: boolean };
        let sources: SourceEntry[];

        if (compiler.root === "none") {
          sources = [];
        } else if (compiler.root === null) {
          sources = [{ base, pattern: "**/*", negated: false }];
        } else {
          sources = [{ ...compiler.root, negated: false }];
        }

        // Add compiler.sources (additional source patterns)
        const compilerSources = (compiler.sources ?? []).map((
          s: { base: string; pattern: string },
        ) => ({
          ...s,
          negated: false,
        }));

        scanner = new oxide.Scanner({
          sources: [...sources, ...compilerSources],
        });
      }

      // Check if file uses Tailwind features that require compilation
      // Features bitmask from @tailwindcss/node
      const features = compiler.features ?? 0;
      const hasTailwindFeatures = (features & (
        TailwindFeatures.AtApply |
        TailwindFeatures.JsPluginCompat |
        TailwindFeatures.ThemeFunction |
        TailwindFeatures.Utilities
      )) !== 0;

      if (!hasTailwindFeatures) {
        return null; // Not a Tailwind file, skip processing
      }

      // Scan for utility class candidates if file uses utilities
      if ((features & TailwindFeatures.Utilities) !== 0) {
        for (const candidate of scanner.scan()) {
          candidates.add(candidate);
        }
      }

      // Build CSS with collected candidates
      let code = compiler.build([...candidates]);

      // Optimize/minify if requested
      if (minify) {
        const optimized = node.optimize(code, { minify: true });
        code = optimized.code;
      }

      // Generate source map if requested
      let map: string | undefined;
      if (sourceMaps && typeof compiler.buildSourceMap === "function") {
        const sourceMapResult = node.toSourceMap(compiler.buildSourceMap());
        map = sourceMapResult?.raw;
      }

      return {
        code,
        map,
        dependencies,
      };
    },

    dispose(): void {
      compiler = null;
      scanner = null;
      candidates.clear();
      buildDependencies.clear();
    },
  };
}

/**
 * Check if CSS content contains Tailwind directives.
 *
 * Useful for quick detection before loading the full Tailwind compiler.
 *
 * @param content - CSS content to check
 * @returns true if content contains Tailwind directives
 */
export function hasTailwindDirectives(content: string): boolean {
  // Check for common Tailwind v4 directives
  return (
    content.includes("@tailwind") ||
    content.includes("@apply") ||
    content.includes("@reference") ||
    content.includes("@theme") ||
    /@import\s+["']tailwindcss["']/.test(content)
  );
}
