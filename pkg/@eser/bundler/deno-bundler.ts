// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Deno Bundler using native Deno.bundle() API.
 * Replaces esbuild with Deno's built-in bundling (introduced in Deno 2.4.0).
 * Requires --unstable-bundle flag.
 *
 * @module
 */

import * as posix from "@std/path/posix";
import { runtime } from "@eser/standards/runtime";
import type { Builder, BuildSnapshot } from "./primitives.ts";

export type DenoBundlerOptions = {
  /** The build ID. */
  buildID: string;
  /** The entrypoints, mapped from name to URL. */
  entrypoints: Record<string, string>;
  /** Whether or not this is a dev build. */
  dev: boolean;
  /** The path to the deno.json / deno.jsonc config file. */
  configPath: string;
  /** The JSX configuration (read from deno.json). */
  jsx?: string;
  jsxImportSource?: string;
  target: string | Array<string>;
  absoluteWorkingDir: string;
  basePath?: string;
};

export type DenoBundlerState = {
  options: DenoBundlerOptions;
};

export const createDenoBundlerState = (
  options: DenoBundlerOptions,
): DenoBundlerState => {
  return {
    options,
  };
};

export class DenoBundler implements Builder {
  readonly state: DenoBundlerState;

  constructor(state: DenoBundlerState) {
    this.state = state;
  }

  async build(): Promise<BuildSnapshot> {
    const opts = this.state.options;
    const tempDir = await runtime.fs.makeTempDir({ prefix: "deno-bundle-" });

    try {
      // Convert named entrypoints Record<string, string> to Array<string>
      const entrypointPaths = Object.values(opts.entrypoints);

      // Create a wrapper entry that injects the build ID
      const buildIdEntryPath = posix.join(tempDir, "_build-id-entry.ts");
      await runtime.fs.writeTextFile(
        buildIdEntryPath,
        `export const BUILD_ID = "${opts.buildID}";\n`,
      );

      // Add build ID entry to entrypoints
      const allEntrypoints = [buildIdEntryPath, ...entrypointPaths];

      const result = await Deno.bundle({
        entrypoints: allEntrypoints,
        outputDir: tempDir,
        format: "esm",
        codeSplitting: true,
        minify: !opts.dev,
        platform: "browser",
      });

      if (!result.success) {
        const errors = (result as unknown as { diagnostics?: unknown[] })
          .diagnostics ?? [];
        const errorDetails = errors.map((e: unknown) => {
          if (e === null || e === undefined) return "Unknown error";
          if ((e as { message?: string }).message) {
            return (e as { message: string }).message;
          }
          return String(e);
        }).join("\n");
        throw new Error(`Bundle failed: ${errorDetails}`);
      }

      // Process output files
      return await this.processOutput(tempDir, opts);
    } finally {
      // Cleanup temp directory
      try {
        await runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async processOutput(
    outputDir: string,
    opts: DenoBundlerOptions,
  ): Promise<BuildSnapshot> {
    const files = new Map<string, Uint8Array>();
    const dependencies = new Map<string, Array<string>>();

    // Deno.bundle() creates a nested dist/ directory
    const nestedDistDir = posix.join(outputDir, "dist");
    let scanDir = outputDir;

    try {
      const nestedStat = await runtime.fs.stat(nestedDistDir);
      if (nestedStat.isDirectory) {
        scanDir = nestedDistDir;
      }
    } catch {
      // No nested dir, use outputDir
    }

    // Collect all output files
    const outputFiles: Array<{ name: string; path: string }> = [];

    // Scan for JS files in the output directory
    for await (const entry of runtime.fs.readDir(scanDir)) {
      if (entry.isFile && entry.name.endsWith(".js")) {
        outputFiles.push({
          name: entry.name,
          path: posix.join(scanDir, entry.name),
        });
      }
    }

    // Also check root outputDir for chunk files if we scanned nested
    if (scanDir !== outputDir) {
      for await (const entry of runtime.fs.readDir(outputDir)) {
        if (
          entry.isFile && entry.name.endsWith(".js") &&
          entry.name.startsWith("chunk-")
        ) {
          const path = posix.join(outputDir, entry.name);
          if (!outputFiles.some((f) => f.path === path)) {
            outputFiles.push({ name: entry.name, path });
          }
        }
      }
    }

    // Process each output file
    for (const file of outputFiles) {
      let content = await runtime.fs.readTextFile(file.path);

      // Post-process: Replace URL paths (replaces devClientUrlPlugin)
      if (opts.basePath !== undefined) {
        content = content.replace(
          /\/_lime\/alive/g,
          `${opts.basePath}/_lime/alive`,
        );
      }

      // Fix relative import paths (Deno.bundle quirk: ../chunk- → ./chunk-)
      content = content.replace(/from\s*["']\.\.\/chunk-/g, 'from"./chunk-');
      content = content.replace(/from\s*["']\.\.chunk-/g, 'from"./chunk-');
      content = content.replace(
        /import\s*\(["']\.\.\/chunk-/g,
        'import("./chunk-',
      );
      content = content.replace(
        /import\s*\(["']\.\.chunk-/g,
        'import("./chunk-',
      );

      // Normalize file name (remove entry prefix patterns)
      let normalizedName = file.name;
      if (normalizedName.startsWith("_client-entry")) {
        normalizedName = "main.js";
      } else if (normalizedName.startsWith("_build-id-entry")) {
        normalizedName = "build-id.js";
      }

      // Store the processed content
      const encoded = new TextEncoder().encode(content);
      files.set(normalizedName, encoded);

      // Parse imports for dependency tracking
      const importDeps = this.parseImports(content);
      dependencies.set(normalizedName, importDeps);
    }

    // Generate metafile for compatibility
    const metafile = {
      outputs: Object.fromEntries(
        Array.from(files.keys()).map((name) => [
          name,
          {
            imports: (dependencies.get(name) ?? []).map((dep) => ({
              path: dep,
              kind: "import-statement",
            })),
          },
        ]),
      ),
    };
    files.set(
      "metafile.json",
      new TextEncoder().encode(JSON.stringify(metafile)),
    );

    return new DenoBundlerSnapshot(
      createDenoBundlerSnapshotState(files, dependencies),
    );
  }

  private parseImports(content: string): Array<string> {
    const imports: Array<string> = [];

    // Match static imports: import ... from "..."
    const staticImportRegex = /import\s+(?:[^;]+)\s+from\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;

    while ((match = staticImportRegex.exec(content)) !== null) {
      const importPath = match[1];
      // Only track local chunk imports
      if (
        importPath !== undefined &&
        (importPath.startsWith("./") || importPath.startsWith("../") ||
          importPath.startsWith("/"))
      ) {
        // Normalize to relative path
        const normalized = importPath.startsWith("./")
          ? importPath.slice(2)
          : importPath.startsWith("../")
          ? importPath
          : importPath.slice(1);
        imports.push(normalized);
      }
    }

    // Match dynamic imports: import("...")
    const dynamicImportRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (
        importPath !== undefined &&
        (importPath.startsWith("./") || importPath.startsWith("../") ||
          importPath.startsWith("/"))
      ) {
        const normalized = importPath.startsWith("./")
          ? importPath.slice(2)
          : importPath.startsWith("../")
          ? importPath
          : importPath.slice(1);
        imports.push(normalized);
      }
    }

    return [...new Set(imports)]; // Deduplicate
  }
}

export type DenoBundlerSnapshotState = {
  files: Map<string, Uint8Array>;
  dependencyMapping: Map<string, Array<string>>;
};

export const createDenoBundlerSnapshotState = (
  files: Map<string, Uint8Array>,
  dependencies: Map<string, Array<string>>,
): DenoBundlerSnapshotState => {
  return {
    files,
    dependencyMapping: dependencies,
  };
};

export class DenoBundlerSnapshot implements BuildSnapshot {
  readonly state: DenoBundlerSnapshotState;

  constructor(state: DenoBundlerSnapshotState) {
    this.state = state;
  }

  get paths(): Array<string> {
    return Array.from(this.state.files.keys());
  }

  read(pathStr: string): Uint8Array | null {
    return this.state.files.get(pathStr) ?? null;
  }

  dependencies(pathStr: string): Array<string> {
    return this.state.dependencyMapping.get(pathStr) ?? [];
  }
}
